declare namespace Cypress {
  interface Chainable {
    loginUi(email: string, password: string): Chainable<void>;
  }
}
