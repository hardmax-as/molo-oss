//! The noun-class rule table: parsing, validation and the two primitive
//! operations every form is built from, stripping a class prefix off a lemma
//! and attaching a class prefix to a stem.
//!
//! The table itself lives in `rules/noun_classes.toml` and is documented for
//! editors in the crate README. Nothing in this module knows any isiXhosa; it
//! only knows how to read the table and apply it.

use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

use crate::MorphError;

/// The TOML text of the built-in rule table, compiled into the crate so the
/// generator and the table can never drift apart.
pub const BUILTIN_RULES_TOML: &str = include_str!("../rules/noun_classes.toml");

const VOWELS: [char; 5] = ['a', 'e', 'i', 'o', 'u'];

/// A condition an [`AttachRule`] can be gated on.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Condition {
    /// Always holds. Every `attach` list must end with a `default` rule.
    Default,
    /// The stem contains exactly one vowel letter.
    Monosyllabic,
    /// The stem begins with a vowel letter.
    VowelInitial,
}

impl Condition {
    fn holds(self, stem: &str) -> bool {
        match self {
            Condition::Default => true,
            Condition::Monosyllabic => vowel_count(stem) == 1,
            Condition::VowelInitial => starts_with_vowel(stem),
        }
    }
}

/// One way of attaching a class prefix to a stem, gated on a [`Condition`].
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
pub struct AttachRule {
    /// The condition under which this rule applies.
    pub when: Condition,
    /// The prefix to attach, written with a trailing hyphen for readability.
    pub form: String,
}

/// Everything the table says about one noun class.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
pub struct NounClassRule {
    /// Class label as used in the lexicon: `"1"`, `"1a"`, `"2"`, ... `"10"`.
    pub label: String,
    /// Free text for editors; unused by the code.
    pub description: String,
    /// The citation prefix as grammars print it. Display only.
    pub prefix: String,
    /// Surface prefixes recognised on a lemma of this class, longest first.
    pub strip: Vec<String>,
    /// How a stem becomes a noun of this class; first matching rule wins.
    pub attach: Vec<AttachRule>,
    /// Label of the paired plural class, for singular classes.
    #[serde(default)]
    pub plural: Option<String>,
    /// Label of the paired singular class, for plural classes.
    #[serde(default)]
    pub singular: Option<String>,
    /// Subject concord, written `xx-`.
    pub subject_concord: String,
    /// Object concord, written `-xx-`.
    pub object_concord: String,
    /// Possessive concord taken as the possessed head, written `xx-`.
    pub possessive_concord: String,
    /// `true` only after the goldens for this class pass with tutor sign-off.
    pub validated: bool,
    /// Anything the next editor needs to know.
    #[serde(default)]
    pub notes: String,
}

impl NounClassRule {
    /// Removes this class's prefix from `lemma` and returns the stem.
    ///
    /// Strip patterns are tried in the order they are listed. Hyphens in the
    /// pattern are ignored; a hyphen left at the front of the stem (loanword
    /// orthography such as `i-orenji`) is removed.
    pub fn stem_of(&self, lemma: &str) -> Result<String, MorphError> {
        for pattern in &self.strip {
            let bare = pattern.trim_end_matches('-');
            if let Some(rest) = lemma.strip_prefix(bare) {
                let stem = rest.trim_start_matches('-');
                if stem.is_empty() {
                    return Err(MorphError::EmptyStem {
                        lemma: lemma.to_string(),
                        class: self.label.clone(),
                    });
                }
                return Ok(stem.to_string());
            }
        }
        Err(MorphError::PrefixMismatch {
            lemma: lemma.to_string(),
            class: self.label.clone(),
            expected: self.strip.clone(),
        })
    }

    /// Builds the noun of this class from `stem` using the first attach rule
    /// whose condition holds.
    ///
    /// When the chosen prefix ends in a vowel, the stem begins with a vowel and
    /// the rule was not a `vowel_initial` one, the two are joined with a
    /// hyphen. See the rule table header for why.
    pub fn attach_to(&self, stem: &str) -> String {
        let rule = self
            .attach
            .iter()
            .find(|r| r.when.holds(stem))
            .or_else(|| self.attach.last())
            .expect("validated tables have at least one attach rule");
        let prefix = rule.form.trim_end_matches('-');
        let needs_hyphen = rule.when != Condition::VowelInitial
            && prefix.chars().last().is_some_and(is_vowel)
            && starts_with_vowel(stem);
        if needs_hyphen {
            format!("{prefix}-{stem}")
        } else {
            format!("{prefix}{stem}")
        }
    }
}

/// The whole rule table.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
pub struct RuleTable {
    /// Format version of the table; only `1` is understood.
    pub schema_version: u32,
    /// The classes, in table order.
    #[serde(rename = "class")]
    pub classes: Vec<NounClassRule>,
}

impl RuleTable {
    /// Parses and validates a rule table from TOML text.
    pub fn parse(toml_text: &str) -> Result<Self, MorphError> {
        let table: RuleTable =
            toml::from_str(toml_text).map_err(|e| MorphError::RuleTable(e.to_string()))?;
        table.validate()?;
        Ok(table)
    }

    /// Looks a class up by label (`"1"`, `"1a"`, `"10"`).
    pub fn class(&self, label: &str) -> Option<&NounClassRule> {
        self.classes.iter().find(|c| c.label == label)
    }

    /// Labels of every class in the table, in table order.
    pub fn labels(&self) -> impl Iterator<Item = &str> {
        self.classes.iter().map(|c| c.label.as_str())
    }

    fn validate(&self) -> Result<(), MorphError> {
        let bad = |msg: String| Err(MorphError::RuleTable(msg));
        if self.schema_version != 1 {
            return bad(format!(
                "unsupported schema_version {}",
                self.schema_version
            ));
        }
        if self.classes.is_empty() {
            return bad("rule table has no classes".to_string());
        }
        for (i, c) in self.classes.iter().enumerate() {
            if c.label.trim().is_empty() {
                return bad(format!("class #{i} has an empty label"));
            }
            if self.classes.iter().filter(|o| o.label == c.label).count() > 1 {
                return bad(format!("class label {:?} appears more than once", c.label));
            }
            if c.strip.is_empty() || c.strip.iter().any(|s| s.trim_end_matches('-').is_empty()) {
                return bad(format!(
                    "class {}: strip must list at least one non-empty prefix",
                    c.label
                ));
            }
            match c.attach.last() {
                Some(last) if last.when == Condition::Default => {}
                _ => {
                    return bad(format!(
                        "class {}: attach must end with a `default` rule",
                        c.label
                    ));
                }
            }
            if c.attach
                .iter()
                .any(|a| a.form.trim_end_matches('-').is_empty())
            {
                return bad(format!("class {}: attach forms must not be empty", c.label));
            }
            for (name, value) in [
                ("subject_concord", &c.subject_concord),
                ("object_concord", &c.object_concord),
                ("possessive_concord", &c.possessive_concord),
            ] {
                if value.trim_matches('-').is_empty() {
                    return bad(format!("class {}: {name} is empty", c.label));
                }
            }
            if c.plural.is_some() && c.singular.is_some() {
                return bad(format!(
                    "class {}: has both plural and singular pairing",
                    c.label
                ));
            }
            if let Some(p) = &c.plural {
                match self.class(p) {
                    None => {
                        return bad(format!(
                            "class {}: plural class {p:?} does not exist",
                            c.label
                        ));
                    }
                    Some(pc) if pc.singular.as_deref() != Some(c.label.as_str()) => {
                        return bad(format!(
                            "class {}: pairs to plural {p:?}, but {p:?} does not pair back to it",
                            c.label
                        ));
                    }
                    Some(_) => {}
                }
            }
            if let Some(s) = &c.singular {
                match self.class(s) {
                    None => {
                        return bad(format!(
                            "class {}: singular class {s:?} does not exist",
                            c.label
                        ));
                    }
                    Some(sc) if sc.plural.as_deref() != Some(c.label.as_str()) => {
                        return bad(format!(
                            "class {}: pairs to singular {s:?}, but {s:?} does not pair back to it",
                            c.label
                        ));
                    }
                    Some(_) => {}
                }
            }
        }
        Ok(())
    }
}

/// The built-in table, parsed once. A parse or validation failure is reported
/// on every call rather than panicking, so a broken table surfaces as a typed
/// error from [`crate::generate`].
pub fn builtin() -> Result<&'static RuleTable, MorphError> {
    static TABLE: OnceLock<Result<RuleTable, MorphError>> = OnceLock::new();
    TABLE
        .get_or_init(|| RuleTable::parse(BUILTIN_RULES_TOML))
        .as_ref()
        .map_err(Clone::clone)
}

fn is_vowel(c: char) -> bool {
    VOWELS.contains(&c.to_ascii_lowercase())
}

fn starts_with_vowel(s: &str) -> bool {
    s.chars().next().is_some_and(is_vowel)
}

fn vowel_count(s: &str) -> usize {
    s.chars().filter(|c| is_vowel(*c)).count()
}

#[cfg(test)]
mod tests {
    use super::*;

    // These tests exercise the mechanics of the table with made-up,
    // non-isiXhosa data. They assert nothing about the language.

    fn table(extra: &str) -> Result<RuleTable, MorphError> {
        RuleTable::parse(&format!(
            r#"
schema_version = 1
[[class]]
label = "s"
description = "test singular"
prefix = "ka-"
strip = ["ka-"]
attach = [{{ when = "default", form = "ka-" }}]
plural = "p"
subject_concord = "k-"
object_concord = "-k-"
possessive_concord = "ka-"
validated = false
[[class]]
label = "p"
description = "test plural"
prefix = "zo-"
strip = ["zolo-", "zo-"]
attach = [{{ when = "monosyllabic", form = "zolo-" }}, {{ when = "vowel_initial", form = "z-" }}, {{ when = "default", form = "zo-" }}]
singular = "s"
subject_concord = "z-"
object_concord = "-z-"
possessive_concord = "za-"
validated = false
{extra}
"#
        ))
    }

    #[test]
    fn parses_and_validates_a_well_formed_table() {
        let t = table("").expect("valid table");
        assert_eq!(t.labels().collect::<Vec<_>>(), ["s", "p"]);
        assert_eq!(t.class("s").unwrap().plural.as_deref(), Some("p"));
    }

    #[test]
    fn rejects_asymmetric_pairing() {
        let err = table(
            r#"
[[class]]
label = "q"
description = "pairs to p but p pairs to s"
prefix = "x-"
strip = ["x-"]
attach = [{ when = "default", form = "x-" }]
plural = "p"
subject_concord = "x-"
object_concord = "-x-"
possessive_concord = "xa-"
validated = false
"#,
        )
        .unwrap_err();
        assert!(
            matches!(err, MorphError::RuleTable(ref m) if m.contains("pair back")),
            "{err}"
        );
    }

    #[test]
    fn rejects_attach_without_trailing_default() {
        let err = table(
            r#"
[[class]]
label = "q"
description = "no default"
prefix = "x-"
strip = ["x-"]
attach = [{ when = "monosyllabic", form = "x-" }]
subject_concord = "x-"
object_concord = "-x-"
possessive_concord = "xa-"
validated = false
"#,
        )
        .unwrap_err();
        assert!(
            matches!(err, MorphError::RuleTable(ref m) if m.contains("default")),
            "{err}"
        );
    }

    #[test]
    fn rejects_duplicate_labels() {
        let err = table(
            r#"
[[class]]
label = "s"
description = "dup"
prefix = "x-"
strip = ["x-"]
attach = [{ when = "default", form = "x-" }]
subject_concord = "x-"
object_concord = "-x-"
possessive_concord = "xa-"
validated = false
"#,
        )
        .unwrap_err();
        assert!(
            matches!(err, MorphError::RuleTable(ref m) if m.contains("more than once")),
            "{err}"
        );
    }

    #[test]
    fn strips_longest_listed_prefix_first_and_drops_loan_hyphen() {
        let t = table("").unwrap();
        let p = t.class("p").unwrap();
        assert_eq!(p.stem_of("zolobu").unwrap(), "bu");
        assert_eq!(p.stem_of("zobubu").unwrap(), "bubu");
        assert_eq!(p.stem_of("zo-ata").unwrap(), "ata");
        assert!(matches!(
            p.stem_of("kabu"),
            Err(MorphError::PrefixMismatch { .. })
        ));
        assert!(matches!(p.stem_of("zo"), Err(MorphError::EmptyStem { .. })));
        assert!(matches!(
            p.stem_of("zo-"),
            Err(MorphError::EmptyStem { .. })
        ));
    }

    #[test]
    fn attach_picks_first_matching_condition() {
        let t = table("").unwrap();
        let p = t.class("p").unwrap();
        assert_eq!(p.attach_to("bu"), "zolobu"); // monosyllabic wins
        assert_eq!(p.attach_to("ata"), "zata"); // vowel_initial: no hyphen
        assert_eq!(p.attach_to("bubu"), "zobubu"); // default
    }

    #[test]
    fn attach_hyphenates_vowel_collision_without_a_vowel_rule() {
        let t = table("").unwrap();
        let s = t.class("s").unwrap();
        assert_eq!(s.attach_to("ata"), "ka-ata");
        assert_eq!(s.attach_to("bata"), "kabata");
    }

    #[test]
    fn builtin_table_parses_and_validates() {
        let t = builtin().expect("built-in rule table must be valid");
        for label in [
            "1", "1a", "2", "2a", "3", "4", "5", "6", "7", "8", "9", "10",
        ] {
            assert!(
                t.class(label).is_some(),
                "class {label} missing from built-in table"
            );
        }
    }
}
