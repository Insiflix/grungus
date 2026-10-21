export interface PollInput {
  question: string;
  answers: string[];
  maxSelections: number;
  disclosed: boolean;
}
export interface PollDefinition {
  question: string;
  answers: { id: string; text: string }[];
  maxSelections: number;
  disclosed: boolean;
}
export interface PollVote {
  id: string;
  sender: string;
  timestamp: number;
  answers: string[];
}
export interface PollSnapshot {
  counts: Record<string, number>;
  totalVoters: number;
  ownAnswers: string[];
  ended: boolean;
  canEnd: boolean;
  loading: boolean;
  incomplete: boolean;
  error?: string;
}
export function validatePollInput(input: PollInput): PollInput {
  const question = input.question.trim();
  const answers = input.answers.map(answer => answer.trim());
  if (!question || question.length > 300) throw new Error("Enter a question of up to 300 characters.");
  if (answers.length < 2 || answers.length > 20 || answers.some(answer => !answer || answer.length > 200)) throw new Error("Enter 2 to 20 answers of up to 200 characters each.");
  if (new Set(answers.map(answer => answer.toLocaleLowerCase())).size !== answers.length) throw new Error("Each answer must be different.");
  if (!Number.isInteger(input.maxSelections) || input.maxSelections < 1 || input.maxSelections > answers.length) throw new Error("Choose a valid maximum number of answers.");
  return { ...input, question, answers };
}
export function pollResults(poll: PollDefinition, votes: PollVote[], userId: string, endTimestamp = Infinity) {
  const latest = new Map<string, PollVote>();
  for (const vote of votes) {
    if (vote.timestamp > endTimestamp) continue;
    const previous = latest.get(vote.sender);
    if (!previous || vote.timestamp > previous.timestamp || (vote.timestamp === previous.timestamp && vote.id > previous.id)) latest.set(vote.sender, vote);
  }
  const counts = Object.fromEntries(poll.answers.map(answer => [answer.id, 0]));
  let totalVoters = 0;
  let ownAnswers: string[] = [];
  for (const vote of latest.values()) {
    // A spoiled/latest empty response withdraws any previous vote.
    if (!vote.answers.length || vote.answers.some(answer => !Object.hasOwn(counts, answer))) continue;
    const valid = [...new Set(vote.answers)].slice(0, poll.maxSelections);
    totalVoters++;
    if (vote.sender === userId) ownAnswers = valid;
    for (const id of valid) counts[id]++;
  }
  return { counts, totalVoters, ownAnswers };
}
