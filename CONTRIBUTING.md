# Contributing

## Project organization

- Keep every project in a lowercase, hyphenated directory.
- Keep reusable components in `shared/`.
- Keep temporary work in `experiments/`.
- Move discontinued or completed projects to `archive/` after documenting the
  outcome and archive date.

## Branches and review

1. Start from `main`.
2. Create a branch such as `feature/cams-ui` or `fix/mobile-navigation`.
3. Make focused changes and update the relevant project documentation.
4. Run the project tests.
5. Commit with a short, meaningful message.
6. Open a pull request and request another team member's review.
7. Merge only after approval and successful checks.

Do not commit project changes directly to `main`.

## Commit messages

Use an imperative, descriptive message such as:

- `Add compressor fleet dashboard`
- `Fix mobile sidebar navigation`
- `Document UI validation results`

Avoid messages such as `update`, `changes`, or `test`.

## Security and privacy

Never commit passwords, API keys, access tokens, private certificates,
personal information, customer information, or confidential documents. Store
runtime credentials in approved secure storage and use environment variables
where appropriate.

## Code and assets

- Keep code readable and comments purposeful.
- Remove temporary, duplicate, generated, and unused files.
- Do not upload copyrighted third-party media without permission.
- Compress approved images and use meaningful filenames.
- Keep large datasets and recordings in approved external storage.

## Testing and status

- Define the expected result before a test.
- Record important test configuration and results in the project README.
- Label incomplete and unverified results accurately.
- Use one status: `Planning`, `In Progress`, `Testing`, `On Hold`, `Completed`,
  or `Archived`.

## Hardware safety

This repository currently contains UI code only. Future hardware tests must
verify wiring, voltage, current limits, emergency-stop provisions, and required
supervision before equipment is energized. Stop immediately if equipment
behaves unexpectedly.
