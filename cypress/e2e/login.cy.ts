describe("logic spec", () => {
  it("given a logged-out user, when submitting credentials, should login", () => {
    cy.loginUi("user@example.com", "password123");
  });
});
