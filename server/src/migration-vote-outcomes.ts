// Persist the decision threshold when a round closes, so later joins cannot
// change the explanation of an immutable outcome.
export const voteOutcomeMigration = `
ALTER TABLE submissions ADD COLUMN required_approvals INTEGER;
ALTER TABLE change_requests ADD COLUMN required_approvals INTEGER;
`;
