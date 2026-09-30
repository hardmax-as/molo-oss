//! WASM bindings (feature `wasm`). The same rules, the same refusals: the
//! binding never returns a form for a class that is not tutor-validated
//! through `can_generate_plural`, and `generate` reports errors as JS
//! strings rather than guessing.

use wasm_bindgen::prelude::*;

use crate::{Form, builtin};

/// `generate(lemma, class, form)` where `form` is one of
/// `plural | singular | subject_concord | object_concord | possessive | locative`
/// (the locative always rejects: no rule yet).
/// Rejects with the `MorphError` message on failure.
#[wasm_bindgen]
pub fn generate(lemma: &str, class: &str, form: &str) -> Result<String, JsValue> {
    let form =
        Form::parse(form).ok_or_else(|| JsValue::from_str(&format!("unknown form {form:?}")))?;
    crate::generate(lemma, class, form).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// `can_generate_plural(lemma, class)`: true only when the class is
/// `validated = true` in the rule table and generation succeeds.
#[wasm_bindgen]
pub fn can_generate_plural(lemma: &str, class: &str) -> bool {
    crate::can_generate_plural(lemma, class)
}

/// The built-in rule table as JSON (`{ schema_version, class: [...] }`),
/// for the editor dashboard and the database seed.
#[wasm_bindgen]
pub fn rule_table_json() -> Result<String, JsValue> {
    let table = builtin().map_err(|e| JsValue::from_str(&e.to_string()))?;
    serde_json::to_string(table).map_err(|e| JsValue::from_str(&e.to_string()))
}
