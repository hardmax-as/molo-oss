# xh-fsrs

A thin wrapper over [`fsrs`](https://crates.io/crates/fsrs) (fsrs-rs, the
FSRS implementation Anki ships). Molo does not hand-roll a scheduler
(STACK.md); this crate only maps between the `review_cards` row
(ARCHITECTURE §2.2) and fsrs-rs, natively and through WASM.

## API

```rust
use xh_fsrs::{Card, Rating, Scheduler};

let scheduler = Scheduler::default();            // fsrs-rs default parameters, retention 0.9
let next = scheduler.next_state(&Card::new(), Rating::Good, now_ms)?;
// next.stability, next.difficulty, next.due_at_ms, next.reps, next.lapses,
// next.state (new|learning|review|relearning), next.elapsed_days, next.scheduled_days
```

`Card` is exactly the FSRS part of a `review_cards` row with timestamps as
Unix milliseconds. `NextState` is what to write back plus the two numbers
`review_log` stores. `Scheduler::with_parameters(&params, retention)` takes
optimised parameters later; `Scheduler::default_parameters()` returns the
fsrs-rs defaults (21 values, FSRS-6).

State transitions follow the usual FSRS convention: a new or learning card
goes to `review` on Good/Easy and stays `learning` on Again/Hard; a `review`
card that gets Again lapses to `relearning` and `lapses` increments; a
relearning card returns to `review` on Good/Easy.

## WASM

Behind the `wasm` feature, three functions are exported with `wasm-bindgen`:

- `next_state(card_json, rating: 1..4, now_ms, params_json?) -> next_state_json`
- `default_parameters() -> json array`
- `new_card() -> card json`

Build and generate the JS glue (`pkg/` is a build product, not committed):

```bash
cargo build --release -p xh-fsrs --target wasm32-unknown-unknown --features wasm
wasm-bindgen --target web --out-dir crates/xh-fsrs/pkg \
  target/wasm32-unknown-unknown/release/xh_fsrs.wasm
bun crates/xh-fsrs/smoke/smoke.ts     # ten reviews, asserts monotone stability
```

On `wasm32-unknown-unknown` the `getrandom` crate that `fsrs` pulls in needs
its `wasm_js` feature; the `wasm` feature of this crate enables it.
Scheduling itself never draws randomness; it is only linked.

## Tests

`cargo test -p xh-fsrs`: ten Good reviews give monotone non-decreasing
stability; Again after a review lapses into relearning and increments
`lapses`; Again on a new card is not a lapse; the default parameter vector
has 21 entries; `Card` round-trips through JSON.
