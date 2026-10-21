import { expect, it } from "vitest";
import { pollResults, validatePollInput, type PollDefinition } from "./Polls";
const poll: PollDefinition = { question: "Lunch?", answers: [{ id: "a", text: "Pizza" }, { id: "b", text: "Pasta" }], maxSelections: 1, disclosed: true };
it("counts the latest vote per person and ignores votes after the poll ends", () => {
  const votes = [
    { id: "$1", sender: "me", timestamp: 1, answers: ["a"] },
    { id: "$2", sender: "me", timestamp: 2, answers: ["b"] },
    { id: "$3", sender: "other", timestamp: 3, answers: ["a"] },
    { id: "$4", sender: "late", timestamp: 5, answers: ["b"] },
  ];
  expect(pollResults(poll, votes, "me", 3)).toEqual({ counts: { a: 1, b: 1 }, totalVoters: 2, ownAnswers: ["b"] });
});
it("withdraws a previous vote on an empty or invalid latest response", () => {
  expect(pollResults(poll, [{ id: "$1", sender: "me", timestamp: 1, answers: ["a"] }, { id: "$2", sender: "me", timestamp: 2, answers: [] }], "me").totalVoters).toBe(0);
  expect(pollResults(poll, [{ id: "$1", sender: "me", timestamp: 1, answers: ["a"] }, { id: "$2", sender: "me", timestamp: 2, answers: ["unknown"] }], "me").totalVoters).toBe(0);
});
it("deduplicates choices and respects max selections", () => {
  expect(pollResults({ ...poll, maxSelections: 2 }, [{ id: "$1", sender: "me", timestamp: 1, answers: ["a", "a", "b"] }], "me")).toEqual({ counts: { a: 1, b: 1 }, totalVoters: 1, ownAnswers: ["a", "b"] });
});
it("validates questions, unique answers and selection limits", () => {
  const input = { question: " Lunch? ", answers: [" Pizza ", "Pasta"], maxSelections: 1, disclosed: true };
  expect(validatePollInput(input).question).toBe("Lunch?");
  expect(() => validatePollInput({ ...input, answers: ["Pizza", "pizza"] })).toThrow("different");
  expect(() => validatePollInput({ ...input, maxSelections: 3 })).toThrow("maximum");
  expect(() => validatePollInput({ ...input, answers: [""] })).toThrow("2 to 20");
});
