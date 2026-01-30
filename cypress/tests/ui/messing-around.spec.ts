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

    cy.login('testuser123', 's3cret');

    cy.getBySel('user-onboarding-dialog').should('be.visible').and('contain', 'Get Started with Real World App');
    cy.getBySel('user-onboarding-next').click();

    cy.getBySel('bankaccount-bankName-input').click();
    cy.getBySel('bankaccount-submit').click();
    cy.getBySel('bankaccount-submit').should('be.disabled');

    cy.getBySel('bankaccount-bankName-input').type('First Bank');
    cy.getBySel('bankaccount-routingNumber-input').type('123456789');
    cy.getBySel('bankaccount-accountNumber-input').type('987654321');

    cy.getBySel('bankaccount-submit').should('be.enabled');

    cy.intercept('POST', '/graphql').as('createBankAccount');
    cy.getBySel('bankaccount-submit').click();
    cy.wait('@createBankAccount').then((subject) => {
      const response = subject.response;
      expect(response?.statusCode).to.eq(200);
      const createRequest = subject.request.body;
      expect(createRequest).to.have.property('operationName', 'CreateBankAccount');
      expect(createRequest.variables.bankName).to.equal('First Bank');
      expect(createRequest.variables.routingNumber).to.equal('123456789');
      expect(createRequest.variables.accountNumber).to.equal('987654321');
      expect(createRequest.variables.userId).to.exist;
    });

    cy.getBySel('user-onboarding-dialog-title').should('contain', 'Finished');
    cy.getBySel('user-onboarding-next').should('have.text', 'Done');
    cy.getBySel('user-onboarding-next').click();
  
    cy.getBySel('user-onboarding-dialog').should('not.exist');
  });
});