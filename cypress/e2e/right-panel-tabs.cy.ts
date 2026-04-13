describe("right panel tabs spec", () => {
  beforeEach(() => {
    cy.loginUi("user@example.com", "password123");
    cy.get("[data-cy=\"nav-projects\"]").click();
    cy.contains("button", "New project").click();
    cy.get("[data-cy=\"display-tab\"]", { timeout: 10000 }).should("be.visible");
  });

  it("should show the Display panel by default with canvas and console", () => {
    cy.get("[data-cy=\"display-tab\"]").should("be.visible");
    cy.get("[data-cy=\"doc-tab\"]").should("be.visible");

    cy.get("canvas").should("be.visible");
    cy.get("iframe[title=\"Naucto Documentation\"]").should("not.be.visible");
  });

  it("should switch to the Doc tab and show the documentation iframe", () => {
    cy.get("[data-cy=\"doc-tab\"]").click();

    cy.get("iframe[title=\"Naucto Documentation\"]").should("be.visible");
    cy.get("iframe[title=\"Naucto Documentation\"]")
      .should("have.attr", "src")
      .and("include", "docs.naucto.net");
  });

  it("should switch back to Display tab and restore canvas and console", () => {
    cy.get("[data-cy=\"doc-tab\"]").click();
    cy.get("iframe[title=\"Naucto Documentation\"]").should("be.visible");

    cy.get("[data-cy=\"display-tab\"]").click();

    cy.get("canvas").should("be.visible");
    cy.get("iframe[title=\"Naucto Documentation\"]").should("not.be.visible");
  });
});
