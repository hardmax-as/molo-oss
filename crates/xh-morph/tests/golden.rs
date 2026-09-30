//! Golden test: every tutor-validated form in `golden/classes_1_10.toml`
//! must be reproduced by the rule table. An unfilled case fails on purpose.

use serde::Deserialize;
use xh_morph::{Form, MorphError, generate};

#[derive(Debug, Deserialize)]
struct GoldenFile {
    schema_version: u32,
    #[serde(rename = "case")]
    cases: Vec<Case>,
}

#[derive(Debug, Deserialize)]
struct Case {
    lemma: String,
    class: String,
    form: String,
    expected: String,
    #[serde(default)]
    irregular: bool,
    #[serde(default)]
    validated_by: String,
    #[serde(default)]
    validated_on: String,
    #[serde(default)]
    note: String,
}

const GOLDEN: &str = include_str!("../golden/classes_1_10.toml");

fn load() -> GoldenFile {
    let g: GoldenFile = toml::from_str(GOLDEN).expect("golden/classes_1_10.toml must parse");
    assert_eq!(g.schema_version, 1, "unknown golden schema_version");
    assert!(!g.cases.is_empty(), "golden file has no cases");
    g
}

#[test]
fn golden_cases_are_well_formed() {
    let g = load();
    for (i, c) in g.cases.iter().enumerate() {
        assert!(!c.lemma.trim().is_empty(), "case #{i}: empty lemma");
        assert!(!c.class.trim().is_empty(), "case #{i}: empty class");
        assert!(
            Form::parse(&c.form).is_some(),
            "case #{i} ({}): unknown form {:?}; use one of plural, singular, subject_concord, object_concord, possessive, locative",
            c.lemma,
            c.form
        );
        let filled = !c.expected.trim().is_empty();
        if filled {
            assert!(
                !c.validated_by.trim().is_empty() && !c.validated_on.trim().is_empty(),
                "case #{i} ({} {} {}): has an expected form but no validated_by / validated_on. Who said so, and when?",
                c.lemma,
                c.class,
                c.form
            );
        }
        let _ = &c.note;
    }
}

#[test]
fn golden_classes_1_10() {
    let g = load();
    let mut failures = Vec::new();
    let mut unfilled = 0usize;

    for (i, c) in g.cases.iter().enumerate() {
        let form = Form::parse(&c.form).expect("checked by golden_cases_are_well_formed");
        let head = format!("case #{i} {} class {} {}", c.lemma, c.class, form);
        if c.expected.trim().is_empty() {
            unfilled += 1;
            failures.push(format!(
                "{head}: TUTOR-VALIDATE (expected form not filled in yet)"
            ));
            continue;
        }
        match (generate(&c.lemma, &c.class, form), c.irregular) {
            (Ok(got), false) if got == c.expected => {}
            (Ok(got), false) => failures.push(format!(
                "{head}: rule table generated {got:?}, tutor says {:?}",
                c.expected
            )),
            (Ok(got), true) if got != c.expected => {} // documented irregular: generator is expected to be wrong
            (Ok(got), true) => failures.push(format!(
                "{head}: marked irregular but the rule table already generates {got:?}; drop the irregular flag"
            )),
            (Err(MorphError::UnknownClass(_)), _) => failures.push(format!(
                "{head}: class is out of scope for this crate"
            )),
            (Err(e), _) => failures.push(format!("{head}: {e}")),
        }
    }

    assert!(
        failures.is_empty(),
        "\n{} of {} golden cases failed ({} unfilled, {} disagreements):\n  {}\n",
        failures.len(),
        g.cases.len(),
        unfilled,
        failures.len() - unfilled,
        failures.join("\n  ")
    );
}
