//! `xh-fsrs`: Molo's spaced-repetition scheduler, a thin wrapper over
//! [`fsrs`] (fsrs-rs, the implementation Anki ships). We do not hand-roll a
//! scheduler (STACK.md); this crate only maps between the `review_cards`
//! row shape (ARCHITECTURE §2.2) and fsrs-rs, natively and through WASM.
//!
//! ```
//! use xh_fsrs::{Card, Rating, Scheduler};
//!
//! let scheduler = Scheduler::default();
//! let now_ms = 1_700_000_000_000.0;
//! let first = scheduler.next_state(&Card::new(), Rating::Good, now_ms).unwrap();
//! assert!(first.stability > 0.0);
//! assert_eq!(first.reps, 1);
//! ```

#![forbid(unsafe_code)]

use std::fmt;

use fsrs::{DEFAULT_PARAMETERS, FSRS, MemoryState};
use serde::{Deserialize, Serialize};

const MS_PER_DAY: f64 = 86_400_000.0;

/// The learner's answer, 1 to 4 as stored in `review_log.rating`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u8)]
pub enum Rating {
    /// Forgot.
    Again = 1,
    /// Recalled with difficulty.
    Hard = 2,
    /// Recalled.
    Good = 3,
    /// Recalled easily.
    Easy = 4,
}

impl Rating {
    /// Parses the 1 to 4 integer used everywhere outside this crate.
    pub fn from_u8(n: u8) -> Option<Rating> {
        match n {
            1 => Some(Rating::Again),
            2 => Some(Rating::Hard),
            3 => Some(Rating::Good),
            4 => Some(Rating::Easy),
            _ => None,
        }
    }
}

/// `review_cards.state`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CardState {
    /// Never reviewed.
    New,
    /// Seen, not yet stable.
    Learning,
    /// In long-term review.
    Review,
    /// Lapsed and being relearned.
    Relearning,
}

/// The FSRS fields of a `review_cards` row. Timestamps are Unix
/// milliseconds so the same shape crosses the WASM boundary unchanged.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Card {
    /// FSRS stability in days.
    pub stability: f32,
    /// FSRS difficulty, 1 to 10.
    pub difficulty: f32,
    /// When the card is next due, Unix ms.
    pub due_at_ms: f64,
    /// When it was last reviewed, Unix ms; `None` for a new card.
    pub last_review_at_ms: Option<f64>,
    /// Number of reviews.
    pub reps: u32,
    /// Number of times it went from review back to relearning.
    pub lapses: u32,
    /// Learning state.
    pub state: CardState,
}

impl Card {
    /// A card that has never been reviewed.
    pub fn new() -> Self {
        Self {
            stability: 0.0,
            difficulty: 0.0,
            due_at_ms: 0.0,
            last_review_at_ms: None,
            reps: 0,
            lapses: 0,
            state: CardState::New,
        }
    }
}

impl Default for Card {
    fn default() -> Self {
        Self::new()
    }
}

/// A review outcome ready to be written as the next `review_cards` row and
/// a `review_log` entry.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NextState {
    /// New stability, days.
    pub stability: f32,
    /// New difficulty.
    pub difficulty: f32,
    /// Next due, Unix ms.
    pub due_at_ms: f64,
    /// The review time, Unix ms.
    pub last_review_at_ms: f64,
    /// Reviews so far including this one.
    pub reps: u32,
    /// Lapses so far including this one if it lapsed.
    pub lapses: u32,
    /// New learning state.
    pub state: CardState,
    /// Days between the previous review and this one (`review_log.elapsed_days`).
    pub elapsed_days: f32,
    /// Days until the next review (`review_log.scheduled_days`).
    pub scheduled_days: f32,
}

/// Why scheduling failed.
#[derive(Debug, Clone, PartialEq)]
pub enum SchedulerError {
    /// Parameters rejected by fsrs-rs.
    Parameters(String),
    /// A rating outside 1 to 4.
    Rating(u8),
    /// fsrs-rs failed to compute the next states.
    Fsrs(String),
}

impl fmt::Display for SchedulerError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SchedulerError::Parameters(m) => write!(f, "invalid FSRS parameters: {m}"),
            SchedulerError::Rating(r) => write!(f, "rating {r} is not in 1..=4"),
            SchedulerError::Fsrs(m) => write!(f, "fsrs: {m}"),
        }
    }
}

impl std::error::Error for SchedulerError {}

/// Wraps an [`FSRS`] model with the project's desired retention.
#[derive(Debug, Clone)]
pub struct Scheduler {
    model: FSRS,
    /// Probability of recall the schedule aims for at the due time.
    pub desired_retention: f32,
}

/// The retention target until real review logs say otherwise.
pub const DEFAULT_DESIRED_RETENTION: f32 = 0.9;

impl Default for Scheduler {
    fn default() -> Self {
        Self {
            model: FSRS::default(),
            desired_retention: DEFAULT_DESIRED_RETENTION,
        }
    }
}

impl Scheduler {
    /// A scheduler with explicit parameters (an empty slice means the fsrs-rs defaults).
    pub fn with_parameters(
        parameters: &[f32],
        desired_retention: f32,
    ) -> Result<Self, SchedulerError> {
        let model = FSRS::new(parameters).map_err(|e| SchedulerError::Parameters(e.to_string()))?;
        Ok(Self {
            model,
            desired_retention,
        })
    }

    /// The fsrs-rs default parameters, as a plain vector.
    pub fn default_parameters() -> Vec<f32> {
        DEFAULT_PARAMETERS.to_vec()
    }

    /// Schedules `card` after a review with `rating` at `now_ms`.
    pub fn next_state(
        &self,
        card: &Card,
        rating: Rating,
        now_ms: f64,
    ) -> Result<NextState, SchedulerError> {
        let elapsed_days_f = card
            .last_review_at_ms
            .map(|last| ((now_ms - last) / MS_PER_DAY).max(0.0))
            .unwrap_or(0.0);
        let elapsed_days = elapsed_days_f.floor() as u32;
        let current = match card.state {
            CardState::New => None,
            _ => Some(MemoryState {
                stability: card.stability,
                difficulty: card.difficulty,
            }),
        };
        let states = self
            .model
            .next_states(current, self.desired_retention, elapsed_days)
            .map_err(|e| SchedulerError::Fsrs(e.to_string()))?;
        let item = match rating {
            Rating::Again => states.again,
            Rating::Hard => states.hard,
            Rating::Good => states.good,
            Rating::Easy => states.easy,
        };
        let lapsed = rating == Rating::Again
            && matches!(card.state, CardState::Review | CardState::Relearning);
        let state = match (card.state, rating) {
            (CardState::New | CardState::Learning, Rating::Again | Rating::Hard) => {
                CardState::Learning
            }
            (CardState::New | CardState::Learning, Rating::Good | Rating::Easy) => {
                CardState::Review
            }
            (CardState::Review, Rating::Again) => CardState::Relearning,
            (CardState::Review, _) => CardState::Review,
            (CardState::Relearning, Rating::Again | Rating::Hard) => CardState::Relearning,
            (CardState::Relearning, Rating::Good | Rating::Easy) => CardState::Review,
        };
        // fsrs-rs intervals are in days and already rounded to the desired
        // retention; a learning-step card comes back within the day.
        let scheduled_days = match state {
            CardState::Learning | CardState::Relearning => item.interval.clamp(0.0, 1.0),
            CardState::Review => item.interval.max(1.0),
            CardState::New => 0.0,
        };
        Ok(NextState {
            stability: item.memory.stability,
            difficulty: item.memory.difficulty,
            due_at_ms: now_ms + f64::from(scheduled_days) * MS_PER_DAY,
            last_review_at_ms: now_ms,
            reps: card.reps + 1,
            lapses: card.lapses + u32::from(lapsed),
            state,
            elapsed_days: elapsed_days_f as f32,
            scheduled_days,
        })
    }
}

impl From<&NextState> for Card {
    fn from(n: &NextState) -> Self {
        Card {
            stability: n.stability,
            difficulty: n.difficulty,
            due_at_ms: n.due_at_ms,
            last_review_at_ms: Some(n.last_review_at_ms),
            reps: n.reps,
            lapses: n.lapses,
            state: n.state,
        }
    }
}

#[cfg(feature = "wasm")]
mod wasm {
    use wasm_bindgen::prelude::*;

    use super::{Card, Rating, Scheduler};

    /// `next_state(card_json, rating, now_ms, params_json?) -> next_state_json`.
    /// `params_json` is a JSON array of f32 or null/undefined for the defaults.
    #[wasm_bindgen]
    pub fn next_state(
        card_json: &str,
        rating: u8,
        now_ms: f64,
        params_json: Option<String>,
    ) -> Result<String, JsValue> {
        let card: Card =
            serde_json::from_str(card_json).map_err(|e| JsValue::from_str(&e.to_string()))?;
        let rating =
            Rating::from_u8(rating).ok_or_else(|| JsValue::from_str("rating must be 1..=4"))?;
        let scheduler = match params_json {
            Some(p) if !p.trim().is_empty() && p.trim() != "null" => {
                let params: Vec<f32> =
                    serde_json::from_str(&p).map_err(|e| JsValue::from_str(&e.to_string()))?;
                Scheduler::with_parameters(&params, super::DEFAULT_DESIRED_RETENTION)
                    .map_err(|e| JsValue::from_str(&e.to_string()))?
            }
            _ => Scheduler::default(),
        };
        let next = scheduler
            .next_state(&card, rating, now_ms)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        serde_json::to_string(&next).map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// The fsrs-rs default parameters as a JSON array.
    #[wasm_bindgen]
    pub fn default_parameters() -> String {
        serde_json::to_string(&Scheduler::default_parameters()).unwrap_or_else(|_| "[]".into())
    }

    /// A fresh card as JSON, so callers do not hand-write the shape.
    #[wasm_bindgen]
    pub fn new_card() -> String {
        serde_json::to_string(&Card::new()).unwrap_or_else(|_| "{}".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const DAY: f64 = 86_400_000.0;

    #[test]
    fn ten_good_reviews_grow_stability_monotonically() {
        let s = Scheduler::default();
        let mut card = Card::new();
        let mut now = 1_700_000_000_000.0;
        let mut last_stability = 0.0f32;
        for i in 0..10 {
            let next = s.next_state(&card, Rating::Good, now).unwrap();
            assert!(
                next.stability >= last_stability,
                "review {i}: {} < {last_stability}",
                next.stability
            );
            assert_eq!(next.reps, i + 1);
            assert_eq!(next.lapses, 0);
            last_stability = next.stability;
            // Review exactly when due.
            now = next.due_at_ms.max(now + DAY);
            card = Card::from(&next);
        }
        assert_eq!(card.state, CardState::Review);
        assert!(
            card.stability > 10.0,
            "stability after ten good reviews: {}",
            card.stability
        );
    }

    #[test]
    fn again_after_review_is_a_lapse_into_relearning() {
        let s = Scheduler::default();
        let now = 1_700_000_000_000.0;
        let first = s.next_state(&Card::new(), Rating::Good, now).unwrap();
        assert_eq!(first.state, CardState::Review);
        let card = Card::from(&first);
        let lapse = s.next_state(&card, Rating::Again, first.due_at_ms).unwrap();
        assert_eq!(lapse.state, CardState::Relearning);
        assert_eq!(lapse.lapses, 1);
        assert!(lapse.stability < first.stability);
        assert!(lapse.scheduled_days <= 1.0);
        let recovered = s
            .next_state(&Card::from(&lapse), Rating::Good, lapse.due_at_ms)
            .unwrap();
        assert_eq!(recovered.state, CardState::Review);
        assert_eq!(recovered.lapses, 1);
    }

    #[test]
    fn again_on_a_new_card_is_not_a_lapse() {
        let s = Scheduler::default();
        let next = s.next_state(&Card::new(), Rating::Again, 0.0).unwrap();
        assert_eq!(next.state, CardState::Learning);
        assert_eq!(next.lapses, 0);
    }

    #[test]
    fn default_parameters_have_the_fsrs6_length() {
        assert_eq!(Scheduler::default_parameters().len(), 21);
        assert!(Scheduler::with_parameters(&[], 0.9).is_ok());
        assert!(
            Scheduler::with_parameters(&[1.0; 3], 0.9).is_ok()
                || Scheduler::with_parameters(&[1.0; 3], 0.9).is_err()
        );
    }

    #[test]
    fn card_round_trips_through_json() {
        let c = Card {
            stability: 3.5,
            difficulty: 5.1,
            due_at_ms: 1.0,
            last_review_at_ms: Some(0.5),
            reps: 2,
            lapses: 1,
            state: CardState::Review,
        };
        let json = serde_json::to_string(&c).unwrap();
        assert!(json.contains("\"state\":\"review\""));
        assert_eq!(serde_json::from_str::<Card>(&json).unwrap(), c);
    }
}
