describe("game editors spec", () => {
  it("given an user, when clicking on a project and tabs, should display editors", () => {
    cy.loginUi("user@example.com", "password123");
    cy.visit("projects");
    cy.contains("button", "New project").click();
    cy.get("[data-cy=\"code-editor\"]").should("be.visible");
    cy.get("[data-cy=\"sprite-editor-tab\"]").click();
    cy.get("[data-cy=\"sprite-editor\"]").should("be.visible");
    cy.get("[data-cy=\"map-editor-tab\"]").click();
    cy.get("[data-cy=\"map-editor\"]").should("be.visible");
    cy.get("[data-cy=\"sound-editor-tab\"]").click();
    cy.get("[data-cy=\"sound-editor\"]").should("be.visible");
  });
});
