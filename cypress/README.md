# Cypress Testing

This directory contains E2E tests for the project using Cypress.

## Setup

```bash
bun install --dev cypress
bun cypress open
```

Setup Cypress in the e2e section and it uses Electron.

## Running Tests

Click on the spec file to run the test in the cypress interface

Or run headlessly using:

```bash
bun cypress run
```

## Naming Conventions

We follow the Gherkin for all test names.

describe → feature or context

it → behavior expected in a clear, readable sentence

Example:

```ts
describe("Login", () => {
  it("Given a non logged user, when submitting all credentials, then are logged", () => {
    cy.loginUi();
    // verify the user can see things
  });
});
```

**small tips:**
Use data-cy for all selectors to keep tests generic, and if generic add it in the component itself.

Factor repeated actions into Cypress custom commands (cypress/support/commands.ts) ex: login command