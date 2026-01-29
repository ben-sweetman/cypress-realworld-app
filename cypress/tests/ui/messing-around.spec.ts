describe("testing various bits", function () {
  beforeEach(function () {
    cy.task("db:seed");
  });

  it("should create an account", function () {
    cy.visit("/");

    cy.getBySel('signup').click();
    cy.getBySel('signup-title').should('be.visible').and('contain', 'Sign Up');
    cy.url().should('include', '/signup');
    cy.getBySel('signup-submit').click();
    cy.getBySel('signup-submit').should('be.disabled');
  
    cy.getBySel('signup-first-name').type('Test');
    cy.getBySel('signup-last-name').type('User');
    cy.getBySel('signup-username').type('testuser123');
    cy.getBySel('signup-password').type('s3cret');
    cy.getBySel('signup-confirmPassword').type('s3cret');

    cy.getBySel('signup-submit').should('be.enabled');

    cy.intercept('POST', '/users').as('signupRequest');
    cy.getBySel('signup-submit').click();
    cy.wait('@signupRequest').its('response.statusCode').should('eq', 201);
  });

  it("should prompt to create a bank account on first login", function () {
    cy.login('existinguser', 's3cret');

    cy.getBySel('user-onboarding-dialog').should('be.visible');
    cy.getBySel('bankaccount-submit').should('be.disabled');
  });
});