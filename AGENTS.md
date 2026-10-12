# AGENTS.md — Banking System Project Instructions

## 1. Project Overview

This project is a banking application where users can register, verify their email, log in, manage their accounts, transfer money, and pay bills.

The goal is to build a secure, reliable, maintainable application while learning how to develop and deploy a real-world full-stack system.

Treat this as a financial application. Security, data integrity, and transaction correctness are more important than development speed.

## 2. Technology Stack

Use the following technologies unless the project owner explicitly approves a change:

### Backend
- Node.js
- JavaScript (ES Modules or CommonJS according to the existing project configuration)
- Express.js
- PostgreSQL
- Sequelize ORM
- Sequelize CLI for database migrations
- JWT for authentication where appropriate
- bcrypt for password hashing
- dotenv for environment configuration
- Redis only where required by an existing or approved feature

### Frontend
- Next.js App Router
- JavaScript only; do not introduce TypeScript
- Tailwind CSS, following the project's existing version and configuration
- REST API communication with the backend
- Responsive, accessible, modern user interfaces

### Database and Deployment
- Aiven PostgreSQL for the configured database environment
- Environment variables for database credentials, secrets, and service URLs
- Separate frontend, backend, and database services where appropriate

Do not replace the existing stack or introduce major dependencies without a clear reason and approval.

## 3. Mandatory Rules Before Editing

Before implementing any feature or fixing a bug:

1. Inspect the existing project structure and relevant files.
2. Read `package.json`, environment-variable references, database configuration, models, migrations, controllers, routes, middleware, and existing tests as applicable.
3. Understand the current implementation and identify dependencies between files.
4. Determine whether the requested change affects the frontend, backend, database, authentication, or deployment configuration.
5. Make the smallest safe changes needed to complete the task.
6. Preserve existing working functionality, established code conventions, and unrelated features.
7. Explain significant architectural changes before making them when they are not explicitly requested.

Do not rebuild the application from scratch when the task only requires an update or bug fix.

Do not assume a file, route, model, or feature is missing without inspecting the project.

## 4. Environment Variables and Secrets

- Never hardcode database credentials, API keys, passwords, JWT secrets, email credentials, or other private configuration.
- Never print, expose, commit, or include secret values in generated documentation, logs, screenshots, or responses.
- Never delete, replace, or overwrite `.env`, `.env.local`, or other environment files without explicit permission.
- Preserve existing environment-variable values unless the project owner explicitly requests a change.
- When renaming an environment variable, search the entire project for every reference and update the relevant configuration consistently.
- Do not change variable names arbitrarily. Use one consistent naming convention across the application.
- Update `.env.example` with placeholder values only; never copy real credentials into it.
- Ensure secret files are excluded from Git where appropriate.
- Never commit real credentials to GitHub.
- Do not silently replace an existing database URL with a placeholder, a local database, or another provider's URL.
- If required configuration is missing or conflicting, explain the issue without exposing the values.

## 5. Database Configuration and Migrations

Use PostgreSQL and Sequelize for database operations.

- Keep database configuration consistent with the project's actual environment variables.
- Use Sequelize models, migrations, and seeders where appropriate.
- Ensure migrations match the existing models and the intended database schema.
- Preserve existing database records and relationships.
- Never drop, reset, recreate, or truncate the database as a troubleshooting shortcut.
- Never use destructive migration commands or `sequelize.sync({ force: true })` unless the project owner explicitly approves the operation and its consequences.
- Do not run development or test migrations against production accidentally.
- Review every migration for potential data loss before applying it.
- Use transactions for operations that require multiple database changes to succeed together.
- Add appropriate foreign keys, unique constraints, indexes, and validation rules.
- Avoid creating duplicate tables, columns, migrations, or indexes without checking the existing schema first.
- Do not assume a migration succeeded merely because the command started. Verify its result.

### Aiven PostgreSQL

- Use the existing Aiven connection configuration and credentials.
- Configure TLS/SSL according to Aiven's current service requirements.
- Use certificate verification and the appropriate CA certificate when required.
- Never disable certificate verification merely to make a connection work.
- Do not print the full connection URL or credentials when debugging.
- Distinguish network, authentication, SSL, database configuration, and migration errors.
- If connectivity fails, diagnose the actual cause before changing the configuration.

## 6. Authentication and Authorization

Implement authentication and authorization on the backend.

- Hash passwords using bcrypt before storing them.
- Never store plaintext passwords.
- Validate user input on the server.
- Use secure JWT handling consistent with the existing authentication design.
- Read secrets and token-expiration settings from environment variables.
- Verify email addresses before enabling features that require a verified account.
- Enforce authorization on protected backend routes.
- Never rely on frontend-only checks to protect private operations.
- Never trust a user ID, role, account ID, balance, or transaction amount simply because the client submitted it.
- Prevent users from changing their own roles or gaining administrator privileges through ordinary profile-update endpoints.
- Return safe error messages without leaking stack traces, passwords, tokens, or database credentials.
- Apply appropriate rate limits and protections to sensitive endpoints.

## 7. Banking and Financial Transaction Rules

These rules are mandatory for every feature involving money.

### Money and balances

- Represent NGN amounts using integer minor units (kobo) or another explicitly approved exact-decimal approach.
- Never use ordinary floating-point arithmetic for financial calculations.
- Validate that transaction amounts are positive and within permitted limits.
- Calculate balances on the server using trusted database records.
- Never accept a client-submitted balance as authoritative.
- Store monetary amounts and currencies consistently.

### Transfers

- Confirm that the sender and recipient accounts exist and are eligible for the operation.
- Confirm that the sender has sufficient available funds.
- Prevent users from accessing or spending from accounts they do not own or have permission to use.
- Debit the sender and credit the recipient within one database transaction.
- Create the corresponding transaction or ledger records atomically.
- If any required step fails, roll back the entire operation.
- Protect against concurrent requests causing double spending or incorrect balances.
- Use appropriate database locks, isolation, constraints, or conditional updates.
- Use idempotency protection for operations that may be retried, where appropriate.
- Generate unique transaction references and prevent duplicate processing.
- Never report a successful transfer until the database transaction has committed.

### Ledger and transaction history

- Maintain an auditable transaction history.
- Record relevant details, including transaction references, amounts, currency, transaction type, status, timestamps, and related accounts.
- Do not silently modify completed financial records to hide or rewrite transaction history.
- Use explicit reversal or adjustment records when correcting completed transactions.
- Keep account balances and ledger records consistent.

### Bill payments

- Validate the biller, customer reference, amount, and payment status on the backend.
- Use clear pending, successful, and failed states when external payment processing is involved.
- Never mark an external payment as successful without reliable confirmation.
- If payment providers are not integrated, clearly identify bill payments as simulated or test operations.

## 8. API and Backend Architecture

Follow the existing project structure. Where appropriate, keep responsibilities separated into:

- Routes
- Controllers
- Services
- Models
- Middleware
- Validators
- Configuration
- Database migrations and seeders
- Utilities
- Tests

Additional rules:

- Keep controllers focused on HTTP request and response handling.
- Place reusable business logic in services where appropriate.
- Validate request bodies, parameters, and query strings.
- Use consistent HTTP status codes and response formats.
- Add centralized error handling where appropriate.
- Avoid duplicating business logic across routes.
- Do not expose internal database errors directly to users.
- Do not remove existing middleware or validation to make an endpoint work.
- Document important API behavior when introducing or changing endpoints.

## 9. Frontend Development Rules

- Use JavaScript, not TypeScript.
- Follow the existing Next.js App Router architecture.
- Keep API communication consistent with the project's configured backend URL.
- Never place private backend secrets in frontend code or `NEXT_PUBLIC_*` variables.
- Display appropriate loading, empty, success, and error states.
- Validate forms on the frontend for usability, while retaining authoritative backend validation.
- Make the interface responsive and accessible.
- Use clear confirmation steps for important financial operations.
- Display transaction references and statuses where appropriate.
- Do not display a transfer as successful until the backend confirms the result.
- Do not store passwords, private credentials, or sensitive authentication data in localStorage.
- Preserve existing pages, navigation, styling, and functionality when updating the UI.
- Do not use browser alerts for routine application interactions when an existing modal, toast, or notification component is available.

## 10. Testing and Verification

After implementing a change:

1. Run the relevant existing tests.
2. Run applicable linting and build commands if configured.
3. Test the affected API endpoints and validation rules.
4. Verify authentication and authorization behavior.
5. Verify relevant database migrations and constraints.
6. Test expected failure scenarios as well as successful operations.
7. Check that unrelated existing functionality still works.

For financial features, test at least:

- Successful transfers.
- Insufficient funds.
- Invalid or zero amounts.
- Nonexistent accounts.
- Unauthorized account access.
- Duplicate requests.
- Concurrent transfers.
- Database failures and transaction rollback.
- Incorrect or missing authentication.

Never claim that a test, migration, build, or deployment succeeded unless it was actually verified.

If a test cannot be run because a service, credential, or dependency is unavailable, state the limitation clearly.

## 11. Git and File Safety

- Do not delete files simply because they appear unused without verifying their purpose.
- Do not overwrite unrelated changes made by the project owner.
- Do not remove existing features to simplify implementation.
- Do not run destructive Git commands such as `git reset --hard`, `git clean -fd`, or force-push operations without explicit permission.
- Do not stage or commit `.env` files, credentials, or private keys.
- Inspect the Git diff before finishing.
- Keep changes focused and explain any new dependencies.

## 12. Working with OpenCode and Kiro

Act as a careful coding agent working inside an existing project.

For each task:

1. Understand the request and inspect the relevant implementation.
2. Identify the root cause before making changes.
3. Follow the existing architecture unless a change is necessary.
4. Implement the smallest complete solution.
5. Verify the change using available tests and checks.
6. Review the diff for regressions, accidental secret exposure, and unrelated modifications.
7. Report the outcome clearly.

Do not claim that a feature is implemented when only its frontend or placeholder has been created.

Do not invent successful external integrations. Clearly distinguish working integrations, simulated behavior, and unfinished work.

Ask for clarification before irreversible actions, destructive database operations, or major architectural changes that were not requested.

## 13. Completion Report

At the end of each task, provide:

- **What changed:** A concise summary of the implementation.
- **Files modified:** The relevant file paths.
- **Database changes:** Migrations created or applied, if any.
- **Security considerations:** Important validation, authorization, or financial safeguards.
- **Verification:** Tests and commands actually run, including failures.
- **Configuration needed:** Environment-variable names or external setup required, without revealing secret values.
- **Remaining issues:** Any known limitations or unfinished work.

The final implementation must preserve existing working features, protect user data, and follow the project's security and financial-integrity requirements.