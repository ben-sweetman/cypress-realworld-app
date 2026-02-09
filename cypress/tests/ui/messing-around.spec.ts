describe("testing various bits", function () {
  beforeEach(function () {
    cy.task("db:seed");
    cy.visit("/");
  });

  it("should create an account", function () {
    cy.signup("newuser", "password123", "New", "User");
  });

  it("should prompt to create a bank account on first login", function () {
    cy.signup('testuser123', 's3cret', 'Test', 'User');
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

  // it.only('should be able to pay a existing payee', function () {
  //   cy.login('Dina20', 's3cret');

  //   cy.getBySel('nav-top-new-transaction').click();
  //   cy.getBySel('users-list').should('be.visible');
  
  //   cy.getBySel('users-list').find('.MuiListItem-root').as('userListItems');
  //   cy.get('@userListItems').should('have.length', 4);

  //   cy.get('@userListItems').eq(0).click();

  //   cy.url().should('include', '/transaction/new');
  //   cy.getBySel('transaction-create-amount-input').type('250.00');
  //   cy.getBySel('transaction-create-description-input').type('Rent payment for June');

  //   cy.intercept('POST', '/transactions').as('createTransaction');
  //   cy.getBySel('transaction-create-submit-payment').click();
  //   cy.wait('@createTransaction').then((subject) => {
  //     const response = subject.response;
  //     expect(response?.statusCode).to.eq(200);
  //     const transaction = response?.body.transaction;
  //     expect(transaction).to.have.property('amount', 25000);
  //     expect(transaction).to.have.property('description', 'Rent payment for June');
  //     expect(transaction).to.have.property('receiverId');
  //     expect(transaction).to.have.property('senderId');
  //     expect(transaction).to.have.property('privacyLevel', 'contacts');
  //     expect(transaction).to.have.property('status', 'complete');

  //     cy.log(`Created transaction with ID: ${transaction.id}`);
  //     cy.log(`Type of transaction ID: ${typeof transaction.id}`);
  //     cy.wrap(transaction.id).as('transactionId');
  //   });

  //   cy.contains('Paid $250.00 for Rent payment for June').should('be.visible');
  //   cy.getBySel('new-transaction-return-to-transactions').click();

  //   cy.getBySel('nav-personal-tab').click();
  //   cy.getBySel('transaction-list').find('.MuiListItem-root').first().as('transactionItem');
  //   cy.get('@transactionItem')
  //     .should('contain', 'Rent payment for June')
  //     .and('contain', 'Darrel Ortiz paid Ted Parisian');
    
  //   cy.get('@transactionId').then((transactionId) => {
  //     cy.get('@transactionItem').find(`[data-test=transaction-amount-${transactionId}]`).should('contain.text', '-$250.00');
  //   });
  // });

  // it.only('should be able to request money from an existing payee', function () {
  //   cy.login('Dina20', 's3cret');

  //   cy.getBySel('nav-top-new-transaction').click();
  //   cy.getBySel('users-list').should('be.visible');

  //   cy.getBySel('users-list').find('.MuiListItem-root').as('userListItems');
  //   cy.get('@userListItems').eq(0).click();

  //   cy.url().should('include', '/transaction/new');
  //   cy.getBySel('transaction-create-amount-input').type('150.00');
  //   cy.getBySel('transaction-create-description-input').type('Requesting payment for utilities');

  //   cy.intercept('POST', '/transactions').as('createTransaction');
  //   cy.getBySel('transaction-create-submit-request').click();
  //   cy.wait('@createTransaction').then((subject) => {
  //     const response = subject.response;
  //     expect(response?.statusCode).to.eq(200);
  //     const transaction = response?.body.transaction;
  //     expect(transaction).to.have.property('amount', 15000);
  //     expect(transaction).to.have.property('description', 'Requesting payment for utilities');
  //     expect(transaction).to.have.property('receiverId');
  //     expect(transaction).to.have.property('senderId');
  //     expect(transaction).to.have.property('privacyLevel', 'contacts');
  //     expect(transaction).to.have.property('status', 'pending');

  //     cy.log(`Created transaction with ID: ${transaction.id}`);
  //   });

  //   cy.contains('Requested $150.00 for Requesting payment for utilities').should('be.visible');
  // });

  [{
    transaction: {
      amount: 250.00,
      description: 'Rent payment for June',
    },
    submitButton: 'transaction-create-submit-payment',
    successText: 'Paid $250.00 for Rent payment for June',
    expectedStatus: 'complete',
    listItemText: 'paid',
    expectedAmount: '-$250.00',
  },
  {
    transaction: {
      amount: 150.00,
      description: 'Requesting payment for utilities',
    },
    submitButton: 'transaction-create-submit-request',
    successText: 'Requested $150.00 for Requesting payment for utilities',
    expectedStatus: 'pending',
    listItemText: 'requested',
    expectedAmount: '+$150.00',
  }].forEach(({ transaction, submitButton, successText, expectedStatus, listItemText, expectedAmount }) => {
    it(`should be able to ${submitButton === 'transaction-create-submit-payment' ? 'pay' : 'request'} money from an existing payee`, function () {
      cy.login('Dina20', 's3cret');

      cy.getBySel('nav-top-new-transaction').click();
      cy.getBySel('users-list').should('be.visible');
    
      cy.getBySel('users-list').find('.MuiListItem-root').as('userListItems');
      cy.get('@userListItems').eq(0).click();

      cy.url().should('include', '/transaction/new');
      cy.getBySel('transaction-create-amount-input').type(transaction.amount.toString());
      cy.getBySel('transaction-create-description-input').type(transaction.description);

      cy.intercept('POST', '/transactions').as('createTransaction');
      cy.getBySel(submitButton).click();
      cy.wait('@createTransaction').then((subject) => {
        const response = subject.response;
        expect(response?.statusCode).to.eq(200);
        const createdTransaction = response?.body.transaction;
        expect(createdTransaction).to.have.property('amount', transaction.amount * 100);
        expect(createdTransaction).to.have.property('description', transaction.description);
        expect(createdTransaction).to.have.property('receiverId');
        expect(createdTransaction).to.have.property('senderId');
        expect(createdTransaction).to.have.property('privacyLevel', 'contacts');
        expect(createdTransaction).to.have.property('status', expectedStatus);

        cy.log(`Created transaction with ID: ${createdTransaction.id}`);
        cy.wrap(createdTransaction.id).as('transactionId');
      });

      cy.contains(successText).should('be.visible');
      cy.getBySel('new-transaction-return-to-transactions').click();

      cy.getBySel('nav-personal-tab').click();
      cy.getBySel('transaction-list').find('.MuiListItem-root').first().as('transactionItem');
      cy.get('@transactionItem')
        .should('contain', transaction.description)
        .and('contain', `Darrel Ortiz ${listItemText} Ted Parisian`);
      
      cy.get('@transactionId').then((transactionId) => {
        cy.get('@transactionItem').find(`[data-test=transaction-amount-${transactionId}]`).should('contain.text', expectedAmount);
      });
    });
  });

  it('should handle user attempting to send an invalid amount', function () {
    cy.login('Dina20', 's3cret');

    cy.getBySel('nav-top-new-transaction').click();
    cy.getBySel('users-list').should('be.visible');
  
    cy.getBySel('users-list').find('.MuiListItem-root').as('userListItems');
    cy.get('@userListItems').eq(0).click();

    cy.url().should('include', '/transaction/new');
    cy.getBySel('transaction-create-amount-input').type('some invalid amount');
    cy.getBySel('transaction-create-description-input').type('Invalid payment test');

    cy.getBySel('transaction-create-amount-input').find('.MuiInputBase-root').should('have.class', 'Mui-error');
    cy.get('#transaction-create-amount-input-helper-text').should('be.visible').and('contain.text', 'Please enter a valid amount');
  });

  it('should be able to change a users settings', function () {
    cy.login('Dina20', 's3cret');

    cy.getBySel('sidenav-user-settings').click();
    cy.url().should('include', '/settings');

    cy.getBySel('user-settings-firstName-input').should('have.value', 'Darrel');
    cy.getBySel('user-settings-lastName-input').should('have.value', 'Ortiz');
    cy.getBySel('user-settings-email-input').should('have.value', 'Marielle_Wiza@yahoo.com');
    cy.getBySel('user-settings-phoneNumber-input').should('have.value', '887-309-1593');

    cy.getBySel('user-settings-firstName-input').clear();
    cy.getBySel('user-settings-firstName-input').type('UpdatedFirstName');
    cy.getBySel('user-settings-lastName-input').clear();
    cy.getBySel('user-settings-lastName-input').type('UpdatedLastName');
    cy.getBySel('user-settings-email-input').clear();
    cy.getBySel('user-settings-email-input').type('testing@test.com');
    cy.getBySel('user-settings-phoneNumber-input').clear();
    cy.getBySel('user-settings-phoneNumber-input').type('123-456-7890');

    cy.intercept('PATCH', '/users/*').as('updateUser');
    cy.getBySel('user-settings-submit').click();
    cy.wait('@updateUser').then((subject) => {
      const response = subject.response;
      expect(response?.statusCode).to.eq(204);
      const updatedUser = subject.request?.body;
      expect(updatedUser).to.have.property('firstName', 'UpdatedFirstName');
      expect(updatedUser).to.have.property('lastName', 'UpdatedLastName');
      expect(updatedUser).to.have.property('email', 'testing@test.com');
      expect(updatedUser).to.have.property('phoneNumber', '123-456-7890');
    });

    cy.getBySel('sidenav-signout').click();
    cy.login('Dina20', 's3cret');
    cy.getBySel('sidenav-user-settings').click();

    cy.getBySel('user-settings-firstName-input').should('have.value', 'UpdatedFirstName');
    cy.getBySel('user-settings-lastName-input').should('have.value', 'UpdatedLastName');
    cy.getBySel('user-settings-email-input').should('have.value', 'testing@test.com');
    cy.getBySel('user-settings-phoneNumber-input').should('have.value', '123-456-7890');
  });

  it('Should be able to delete bank account', function () {
    cy.login('Dina20', 's3cret');

    cy.getBySel('sidenav-bankaccounts').click();
    cy.url().should('include', '/bankaccounts');
  
    cy.getBySelLike('bankaccount-list-item').should('have.length', 1).first().as('bankAccountItem');
    cy.get('@bankAccountItem').should('contain.text', 'Okuneva Inc Bank');

    cy.intercept('POST', '/graphql').as('deleteBankAccount');
    cy.get('@bankAccountItem').find('[data-test=bankaccount-delete]').click();

    cy.wait('@deleteBankAccount').then((subject) => {
      const response = subject.response;
      expect(response?.statusCode).to.eq(200);

      const request = subject.request.body;
      expect(request).to.have.property('operationName', 'DeleteBankAccount');
    });

    cy.get('@bankAccountItem').should('contain.text', 'Okuneva Inc Bank (Deleted)');
    cy.getBySel('bankaccount-delete').should('not.exist');
  });

  it('should be able to create account from the bank accounts page', function () {
    cy.login('Dina20', 's3cret');

    cy.getBySel('sidenav-bankaccounts').click();
    cy.url().should('include', '/bankaccounts');

    cy.getBySelLike('bankaccount-list-item').should('have.length', 1).first().as('bankAccountItem');
    cy.get('@bankAccountItem').should('contain.text', 'Okuneva Inc Bank');
    
    cy.getBySel('bankaccount-new').click();

    cy.url().should('include', '/bankaccounts/new');

    cy.getBySel('bankaccount-bankName-input').type('New Bank Name');
    cy.getBySel('bankaccount-routingNumber-input').type('123456789');
    cy.getBySel('bankaccount-accountNumber-input').type('987654321');

    cy.intercept('POST', '/graphql').as('createBankAccount');
    cy.getBySel('bankaccount-submit').click();
    cy.wait('@createBankAccount').then((subject) => {
      const response = subject.response;
      expect(response?.statusCode).to.eq(200);
      const createRequest = subject.request.body;
      expect(createRequest).to.have.property('operationName', 'CreateBankAccount');
      expect(createRequest.variables.bankName).to.equal('New Bank Name');
      expect(createRequest.variables.routingNumber).to.equal('123456789');
      expect(createRequest.variables.accountNumber).to.equal('987654321');
      expect(createRequest.variables.userId).to.exist;
    });

    cy.getBySelLike('bankaccount-list-item').should('have.length', 2).last().should('contain.text', 'New Bank Name');
  });
});