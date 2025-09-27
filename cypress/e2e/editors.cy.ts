describe("game editors spec", () => {
  it("given an user, when clicking on new project, should create a new project with all tabs working", () => {
    cy.loginUi("user@example.com", "password123");

    cy.get("[data-cy=\"nav-projects\"]").click();
    cy.contains("button", "New project").click();

    cy.get("[data-cy=\"code-editor\"]").should("be.visible");

    cy.get("[data-cy=\"spite-tab\"]").click();
    cy.get("[data-cy=\"sprite-editor\"]").should("be.visible");

    cy.get("[data-cy=\"map-tab\"]").click();
    cy.get("[data-cy=\"map-editor\"]").should("be.visible");

    cy.get("[data-cy=\"sound-tab\"]").click();
    cy.get("[data-cy=\"sound-editor\"]").should("be.visible");
  });
});
