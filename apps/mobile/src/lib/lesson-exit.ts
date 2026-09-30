/**
 * Whether leaving a lesson needs a confirmation (audit M06): once at least
 * one exercise is done the learner has answers to lose, until the lesson is
 * over and the celebration owns the screen, or hearts have paused it. The
 * rule lives in @molo/core so the web app asks at exactly the same moments;
 * the subpath keeps Effect out of Jest.
 */
export { mustConfirmExit } from "@molo/core/lesson";
