//! `xh-morph`: a rule-based isiXhosa noun-class and concord generator.
//!
//! This crate is the anti-hallucination organ of Molo. Inflected forms and
//! concords are produced from an editor-readable rule table
//! (`rules/noun_classes.toml`), never from a language model, and every rule is
//! held to golden forms a native speaker has signed off
//! (`golden/classes_1_10.toml`). If a form cannot be generated, the caller
//! gets a typed [`MorphError`] and must not invent one.
//!
//! Scope of this first cut: noun classes 1 to 10 (with 1a and 2a) and five
//! forms, see [`Form`]. A sixth, the locative, is asked of the tutor first:
//! [`generate`] refuses it with [`MorphError::NoRule`] until her answers
//! exist and a rule is written against them. Classes 11 to 15 and verbal morphology come later
//! (PLAN.md, Phase 5).
//!
//! ```
//! use xh_morph::{Form, MorphError, generate};
//!
//! // A lemma that does not carry the prefix of the class it is claimed to be
//! // in is refused rather than guessed at.
//! assert!(matches!(
//!     generate("abantu", "1", Form::Plural),
//!     Err(MorphError::PrefixMismatch { .. })
//! ));
//! // Asking for the plural of a plural class is refused too, and so is
//! // the singular of a singular class.
//! assert!(matches!(
//!     generate("abantu", "2", Form::Plural),
//!     Err(MorphError::NoPluralPairing { .. })
//! ));
//! assert!(matches!(
//!     generate("umntu", "1", Form::Singular),
//!     Err(MorphError::NoSingularPairing { .. })
//! ));
//! ```

#![forbid(unsafe_code)]

mod rules;
#[cfg(feature = "wasm")]
mod wasm;

use std::fmt;

pub use rules::{AttachRule, BUILTIN_RULES_TOML, Condition, NounClassRule, RuleTable, builtin};

/// The forms this crate can generate for a noun.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Form {
    /// The plural noun of a singular lemma (whole word).
    Plural,
    /// The singular noun of a plural lemma (whole word): the other side of the pair.
    Singular,
    /// The subject concord the noun's class takes on a verb, written `xx-`.
    SubjectConcord,
    /// The object concord the noun's class takes inside a verb, written `-xx-`.
    ObjectConcord,
    /// The possessive concord a noun of this class takes as the possessed head, written `xx-`.
    Possessive,
    /// The noun as a place, "at, in, to or from" it (whole word). No rule yet:
    /// always [`MorphError::NoRule`], so the golden cases collect the tutor's
    /// answers before a rule is written.
    Locative,
}

impl Form {
    /// All forms, in a stable order.
    pub const ALL: [Form; 6] = [
        Form::Plural,
        Form::Singular,
        Form::SubjectConcord,
        Form::ObjectConcord,
        Form::Possessive,
        Form::Locative,
    ];

    /// The snake_case name used in golden files and on the CLI.
    pub fn as_str(self) -> &'static str {
        match self {
            Form::Plural => "plural",
            Form::Singular => "singular",
            Form::SubjectConcord => "subject_concord",
            Form::ObjectConcord => "object_concord",
            Form::Possessive => "possessive",
            Form::Locative => "locative",
        }
    }

    /// Parses the snake_case name; `None` for anything else.
    pub fn parse(s: &str) -> Option<Form> {
        Form::ALL.into_iter().find(|f| f.as_str() == s)
    }
}

impl fmt::Display for Form {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Why a form could not be generated. Every variant is a reason to stop, not
/// a reason to guess.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MorphError {
    /// The class label is not in the rule table (out of scope or a typo).
    UnknownClass(String),
    /// The lemma does not begin with any prefix the class recognises.
    PrefixMismatch {
        /// The lemma as given.
        lemma: String,
        /// The class label as given.
        class: String,
        /// The prefixes the class does recognise.
        expected: Vec<String>,
    },
    /// Stripping the prefix left nothing.
    EmptyStem {
        /// The lemma as given.
        lemma: String,
        /// The class label as given.
        class: String,
    },
    /// The class has no plural pairing (it is itself a plural class, or a class without one).
    NoPluralPairing {
        /// The class label as given.
        class: String,
    },
    /// The class has no singular pairing (it is itself a singular class, or a class without one).
    NoSingularPairing {
        /// The class label as given.
        class: String,
    },
    /// The rule table failed to parse or validate.
    RuleTable(String),
    /// The form has no rule in this crate yet (the locative): it is being
    /// collected from the tutor first.
    NoRule {
        /// The form asked for.
        form: Form,
    },
}

impl fmt::Display for MorphError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            MorphError::UnknownClass(c) => write!(f, "unknown noun class {c:?}"),
            MorphError::PrefixMismatch {
                lemma,
                class,
                expected,
            } => write!(
                f,
                "lemma {lemma:?} does not start with a class {class} prefix (expected one of {})",
                expected.join(", ")
            ),
            MorphError::EmptyStem { lemma, class } => {
                write!(
                    f,
                    "lemma {lemma:?} is only a class {class} prefix; no stem left"
                )
            }
            MorphError::NoPluralPairing { class } => {
                write!(f, "class {class} has no plural pairing in the rule table")
            }
            MorphError::NoSingularPairing { class } => {
                write!(f, "class {class} has no singular pairing in the rule table")
            }
            MorphError::RuleTable(msg) => write!(f, "rule table error: {msg}"),
            MorphError::NoRule { form } => write!(
                f,
                "no {form} rule yet; the tutor's answers in the golden file come first"
            ),
        }
    }
}

impl std::error::Error for MorphError {}

/// Generates `form` for `lemma`, a noun of class `class`, using the built-in
/// rule table.
///
/// `lemma` is the citation form as it appears in the lexicon (with its class
/// prefix, e.g. `umntu`); `class` is the label from the lexicon (`"1"`,
/// `"1a"`, ... `"10"`). The class always comes from the lexicon row; this
/// function never infers a class from the surface form.
pub fn generate(lemma: &str, class: &str, form: Form) -> Result<String, MorphError> {
    generate_with(builtin()?, lemma, class, form)
}

/// Whether the plural of `lemma` (class `class`) may be generated *and
/// trusted*: the class must be marked `validated = true` in the rule table
/// and generation must succeed. An unvalidated rule is not a source of
/// truth, so this is `false` for every class until the goldens are signed
/// off. This is the answer the publish gate asks for.
pub fn can_generate_plural(lemma: &str, class: &str) -> bool {
    let Ok(table) = builtin() else { return false };
    let Some(rule) = table.class(class) else {
        return false;
    };
    rule.validated && generate_with(table, lemma, class, Form::Plural).is_ok()
}

/// [`generate`] against an explicit rule table (tests, editor previews of a
/// proposed table).
pub fn generate_with(
    table: &RuleTable,
    lemma: &str,
    class: &str,
    form: Form,
) -> Result<String, MorphError> {
    let rule = table
        .class(class)
        .ok_or_else(|| MorphError::UnknownClass(class.to_string()))?;
    let stem = rule.stem_of(lemma)?;
    match form {
        Form::Locative => Err(MorphError::NoRule { form }),
        Form::SubjectConcord => Ok(rule.subject_concord.clone()),
        Form::ObjectConcord => Ok(rule.object_concord.clone()),
        Form::Possessive => Ok(rule.possessive_concord.clone()),
        Form::Plural => {
            let plural_label =
                rule.plural
                    .as_deref()
                    .ok_or_else(|| MorphError::NoPluralPairing {
                        class: class.to_string(),
                    })?;
            let plural_rule = table
                .class(plural_label)
                .ok_or_else(|| MorphError::UnknownClass(plural_label.to_string()))?;
            Ok(plural_rule.attach_to(&stem))
        }
        Form::Singular => {
            let singular_label =
                rule.singular
                    .as_deref()
                    .ok_or_else(|| MorphError::NoSingularPairing {
                        class: class.to_string(),
                    })?;
            let singular_rule = table
                .class(singular_label)
                .ok_or_else(|| MorphError::UnknownClass(singular_label.to_string()))?;
            Ok(singular_rule.attach_to(&stem))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Error paths and formatting only. No test in this crate asserts an
    // isiXhosa surface form except the golden test, whose forms come from a
    // tutor.

    #[test]
    fn form_names_round_trip() {
        for f in Form::ALL {
            assert_eq!(Form::parse(f.as_str()), Some(f));
            assert_eq!(f.to_string(), f.as_str());
        }
        assert_eq!(Form::parse("genitive"), None);
    }

    #[test]
    fn unknown_class_is_an_error() {
        assert_eq!(
            generate("umntu", "42", Form::Plural),
            Err(MorphError::UnknownClass("42".into()))
        );
        assert!(matches!(
            generate("uncedo", "11", Form::SubjectConcord),
            Err(MorphError::UnknownClass(_))
        ));
    }

    #[test]
    fn wrong_prefix_for_class_is_an_error() {
        assert!(matches!(
            generate("abantu", "1", Form::SubjectConcord),
            Err(MorphError::PrefixMismatch { .. })
        ));
    }

    #[test]
    fn plural_of_a_plural_class_is_an_error() {
        for (lemma, class) in [
            ("abantu", "2"),
            ("ootata", "2a"),
            ("imithi", "4"),
            ("izinja", "10"),
        ] {
            assert!(
                matches!(
                    generate(lemma, class, Form::Plural),
                    Err(MorphError::NoPluralPairing { .. })
                ),
                "{lemma} {class}"
            );
        }
    }

    #[test]
    fn singular_of_a_singular_class_is_an_error() {
        for (lemma, class) in [
            ("umntu", "1"),
            ("utata", "1a"),
            ("umthi", "3"),
            ("inja", "9"),
        ] {
            assert!(
                matches!(
                    generate(lemma, class, Form::Singular),
                    Err(MorphError::NoSingularPairing { .. })
                ),
                "{lemma} {class}"
            );
        }
    }

    #[test]
    fn singular_and_plural_are_the_two_sides_of_one_pair() {
        // No isiXhosa surface form is asserted (that is the golden file's
        // business): a placeholder stem goes round the pair and must land
        // where it started.
        let t = builtin().unwrap();
        // Two vowels, one vowel, and vowel-initial: each prefix rule's branch.
        for stem in ["zzbaba", "zzba", "abab"] {
            for c in t.classes.iter().filter(|c| c.plural.is_some()) {
                let lemma = c.attach_to(stem);
                let plural = generate_with(t, &lemma, &c.label, Form::Plural).unwrap();
                let back = generate_with(t, &plural, c.plural.as_deref().unwrap(), Form::Singular);
                assert_eq!(
                    back.as_deref(),
                    Ok(lemma.as_str()),
                    "class {} {stem}",
                    c.label
                );
            }
        }
    }

    #[test]
    fn locative_has_no_rule_yet() {
        assert_eq!(
            generate("umntu", "1", Form::Locative),
            Err(MorphError::NoRule {
                form: Form::Locative
            })
        );
        // The class and prefix are still checked first.
        assert!(matches!(
            generate("abantu", "1", Form::Locative),
            Err(MorphError::PrefixMismatch { .. })
        ));
    }

    #[test]
    fn bare_prefix_is_an_error() {
        assert!(matches!(
            generate("um", "1", Form::Plural),
            Err(MorphError::EmptyStem { .. })
        ));
    }

    #[test]
    fn concords_follow_the_hyphen_convention() {
        // Shape only: subject and possessive concords end in "-", object
        // concords are wrapped in "-". Which letters they contain is the
        // golden file's business.
        let t = builtin().unwrap();
        for c in &t.classes {
            assert!(
                c.subject_concord.ends_with('-'),
                "class {}: subject_concord",
                c.label
            );
            assert!(
                !c.subject_concord.starts_with('-'),
                "class {}: subject_concord",
                c.label
            );
            assert!(
                c.object_concord.starts_with('-') && c.object_concord.ends_with('-'),
                "class {}: object_concord",
                c.label
            );
            assert!(
                c.possessive_concord.ends_with('-'),
                "class {}: possessive_concord",
                c.label
            );
        }
    }

    #[test]
    fn no_builtin_class_is_marked_validated_before_goldens_exist() {
        // Flip this test when the first class is signed off: it exists so that
        // `validated = true` cannot be set casually while every golden is empty.
        let t = builtin().unwrap();
        let golden: toml::Value =
            toml::from_str(include_str!("../golden/classes_1_10.toml")).unwrap();
        let any_filled = golden["case"]
            .as_array()
            .unwrap()
            .iter()
            .any(|c| !c["expected"].as_str().unwrap_or("").trim().is_empty());
        if !any_filled {
            for c in &t.classes {
                assert!(
                    !c.validated,
                    "class {} is marked validated but no golden case is filled in",
                    c.label
                );
            }
        }
    }

    #[test]
    fn can_generate_plural_is_false_while_nothing_is_validated() {
        // Every class is validated = false today (see rules/noun_classes.toml),
        // so even a lemma the rules can inflect must not be trusted.
        assert!(!can_generate_plural("umntu", "1"));
        assert!(!can_generate_plural("inja", "9"));
        assert!(!can_generate_plural("abantu", "2"));
        assert!(!can_generate_plural("umntu", "42"));
    }

    #[test]
    fn errors_display_usefully() {
        let e = generate("abantu", "1", Form::Plural).unwrap_err();
        assert!(e.to_string().contains("abantu"));
        assert!(e.to_string().contains("um-"));
    }
}
