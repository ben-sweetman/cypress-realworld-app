import path from "path";
import bcrypt from "bcryptjs";
import fs from "fs";
import { v4 } from "uuid";
import {
  uniqBy,
  map,
  sample,
  reject,
  includes,
  orderBy,
  flow,
  flatMap,
  curry,
  get,
  constant,
  filter,
  inRange,
  remove,
} from "lodash/fp";
import { isWithinInterval } from "date-fns";
import shortid from "shortid";
import {
  BankAccount,
  Transaction,
  User,
  Contact,
  TransactionStatus,
  TransactionRequestStatus,
  Like,
  Comment,
  PaymentNotification,
  PaymentNotificationStatus,
  LikeNotification,
  CommentNotification,
  NotificationType,
  NotificationPayloadType,
  NotificationsType,
  TransactionResponseItem,
  TransactionPayload,
  BankTransfer,
  BankTransferPayload,
  BankTransferType,
  NotificationResponseItem,
  TransactionQueryPayload,
  DefaultPrivacyLevel,
} from "../src/models";
import Fuse from "fuse.js";
import {
  isPayment,
  getTransferAmount,
  hasSufficientFunds,
  getChargeAmount,
  hasDateQueryFields,
  getDateQueryFields,
  hasAmountQueryFields,
  getAmountQueryFields,
  getQueryWithoutFilterFields,
  getPayAppCreditedAmount,
  isRequestTransaction,
  formatFullName,
  isLikeNotification,
  isCommentNotification,
} from "../src/utils/transactionUtils";
import { DbSchema } from "../src/models/db-schema";
import { MongoClient } from "mongodb";

export type TDatabase = {
  users: User[];
  contacts: Contact[];
  bankaccounts: BankAccount[];
  transactions: Transaction[];
  likes: Like[];
  comments: Comment[];
  notifications: NotificationType[];
  banktransfers: BankTransfer[];
};

const USER_TABLE = "users";
const CONTACT_TABLE = "contacts";
const BANK_ACCOUNT_TABLE = "bankaccounts";
const TRANSACTION_TABLE = "transactions";
const LIKE_TABLE = "likes";
const COMMENT_TABLE = "comments";
const NOTIFICATION_TABLE = "notifications";
const BANK_TRANSFER_TABLE = "banktransfers";

const client = new MongoClient("mongodb://localhost:27017");
let db: any;

// Initialize the database connection
const initializeDatabase = async () => {
  if (!db) {
    await client.connect();
    db = client.db("rwa-mongo");
  }
  return db;
};

// Helper to ensure database is initialized
const getDb = async () => {
  if (!db) {
    await initializeDatabase();
  }
  return db;
};

// Helper to remove MongoDB's _id field and cast to proper type
const cleanMongoDoc = <T>(doc: any): T => {
  if (!doc) return doc;
  if (Array.isArray(doc)) {
    return doc.map(d => {
      const { _id, ...rest } = d;
      return rest as T;
    }) as any;
  }
  const { _id, ...rest } = doc;
  return rest as T;
};

export const seedDatabase = async () => {
  const database = await getDb();
  // Read the seed data
  const seedData = JSON.parse(
    await fs.promises.readFile(path.join(process.cwd(), "data", "database-seed.json"), 'utf-8')
  );

  // Import each collection
  for (const [collectionName, documents] of Object.entries(seedData)) {
    if (Array.isArray(documents) && documents.length > 0) {
      await database.collection(collectionName).deleteMany({}); // Clear existing
      await database.collection(collectionName).insertMany(documents);
      console.log(`Imported ${documents.length} ${collectionName}`);
    }
  }

  console.log('Seed data imported successfully');
  return;
};

export const getAllUsers = async (): Promise<User[]> => 
  cleanMongoDoc<User[]>(await (await getDb()).collection(USER_TABLE).find().toArray());

export const getAllPublicTransactions = async (): Promise<Transaction[]> =>
  cleanMongoDoc<Transaction[]>(await (await getDb()).collection(TRANSACTION_TABLE).find({ privacyLevel: DefaultPrivacyLevel.public }).toArray());

export const getAllForEntity = async (entity: keyof DbSchema) => 
  cleanMongoDoc(await (await getDb()).collection(entity).find().toArray());

export const getAllBy = async (entity: keyof DbSchema, key: string, value: any) => {
  const database = await getDb();
  const result = await database
    .collection(entity)
    // @ts-ignore
    .find({ [`${key}`]: value })
    .toArray();

  return cleanMongoDoc(result);
};

export const getBy = async (entity: keyof DbSchema, key: string, value: any) => {
  const database = await getDb();
  const result = await database
    .collection(entity)
    // @ts-ignore
    .findOne({ [`${key}`]: value });

  return cleanMongoDoc(result);
};

export const getAllByObj = async (entity: keyof DbSchema, query: object) => {
  const database = await getDb();
  const result = await database
    .collection(entity)
    // @ts-ignore
    .find(query)
    .toArray();

  return cleanMongoDoc(result);
};

// Search
export const cleanSearchQuery = (query: string) => query.replace(/[^a-zA-Z0-9]/g, "");

export const setupSearch = curry((items: object[], options: {}, query: string) => {
  const fuse = new Fuse(items, options);
  return fuse.search(query);
});

export const performSearch = (items: object[], options: {}, query: string) =>
  flow(
    cleanSearchQuery,
    setupSearch(items, options),
    map((result) => result.item)
  )(query);

export const searchUsers = async (query: string) => {
  const items = await getAllUsers();
  return performSearch(
    items,
    {
      keys: ["firstName", "lastName", "username", "email", "phoneNumber"],
    },
    query
  ) as User[];
};

export const removeUserFromResults = (userId: User["id"], results: User[]) =>
  remove({ id: userId }, results);

// convenience methods

// User
export const getUserBy = async (key: string, value: any) => await getBy(USER_TABLE, key, value);
export const getUserId = (user: User): string => user.id;
export const getUserById = async (id: string): Promise<User> => (await getUserBy("id", id)) as User;
export const getUserByUsername = async (username: string): Promise<User> => (await getUserBy("username", username)) as User;

export const createUser = async (userDetails: Partial<User>): Promise<User> => {
  const password = bcrypt.hashSync(userDetails.password!, 10);
  const user: User = {
    id: shortid(),
    uuid: v4(),
    firstName: userDetails.firstName!,
    lastName: userDetails.lastName!,
    username: userDetails.username!,
    password,
    email: userDetails.email!,
    phoneNumber: userDetails.phoneNumber!,
    balance: Number(userDetails.balance!) || 0,
    avatar: userDetails.avatar!,
    defaultPrivacyLevel: userDetails.defaultPrivacyLevel!,
    createdAt: new Date(),
    modifiedAt: new Date(),
  };

  await saveUser(user);
  return user;
};

const saveUser = async (user: User) => {
  const database = await getDb();
  await database.collection(USER_TABLE).insertOne(user);
};

export const updateUserById = async (userId: string, edits: Partial<User>) => {
  const database = await getDb();
  await database.collection(USER_TABLE).updateOne({ id: userId }, { $set: edits });
};

// Contact
export const getContactBy = async (key: string, value: any): Promise<Contact> => (await getBy(CONTACT_TABLE, key, value)) as Contact;

export const getContactsBy = async (key: string, value: any): Promise<Contact[]> => (await getAllBy(CONTACT_TABLE, key, value)) as Contact[];

export const getContactsByUsername = async (username: string): Promise<Contact[]> => {
  const user = await getUserByUsername(username);
  const userId = getUserId(user);
  return await getContactsByUserId(userId);
};

export const getContactsByUserId = async (userId: string): Promise<Contact[]> => await getContactsBy("userId", userId);

export const createContact = async (contact: Contact): Promise<Contact> => {
  const database = await getDb();
  // db.get(CONTACT_TABLE).push(contact).write();
  await database.collection(CONTACT_TABLE).insertOne(contact);

  // manual lookup after create
  return (await getContactBy("id", contact.id));
};

export const removeContactById = async (contactId: string) => {
  const database = await getDb();
  await database.collection(CONTACT_TABLE).deleteOne({ id: contactId });
};

export const createContactForUser = async (userId: string, contactUserId: string): Promise<Contact> => {
  const contactId = shortid();
  const contact: Contact = {
    id: contactId,
    uuid: v4(),
    userId,
    contactUserId,
    createdAt: new Date(),
    modifiedAt: new Date(),
  };

  // Write contact record to the database
  const result = await createContact(contact);

  return result;
};

// Bank Account
export const getBankAccountBy = async (key: string, value: any): Promise<BankAccount> => (await getBy(BANK_ACCOUNT_TABLE, key, value)) as BankAccount;

export const getBankAccountById = async (id: string): Promise<BankAccount> => await getBankAccountBy("id", id);

export const getBankAccountsBy = async (key: string, value: any): Promise<BankAccount[]> =>
  (await getAllBy(BANK_ACCOUNT_TABLE, key, value)) as BankAccount[];

export const createBankAccount = async (bankaccount: BankAccount): Promise<BankAccount> => {
  const database = await getDb();
  await database.collection(BANK_ACCOUNT_TABLE).insertOne(bankaccount);

  // manual lookup after create
  return await getBankAccountBy("id", bankaccount.id);
};

export const createBankAccountForUser = async (userId: string, accountDetails: Partial<BankAccount>): Promise<BankAccount> => {
  const accountId = shortid();
  const bankaccount: BankAccount = {
    id: accountId,
    uuid: v4(),
    userId,
    bankName: accountDetails.bankName!,
    accountNumber: accountDetails.accountNumber!,
    routingNumber: accountDetails.routingNumber!,
    isDeleted: false,
    createdAt: new Date(),
    modifiedAt: new Date(),
  };

  // Write bank account record to the database
  const result = await createBankAccount(bankaccount);

  return result;
};

export const removeBankAccountById = async (bankAccountId: string) => {
  const database = await getDb();
  await database.collection(BANK_ACCOUNT_TABLE).updateOne({ id: bankAccountId }, { $set: { isDeleted: true } });
};

// Bank Transfer
// Note: Balance transfers from/to bank accounts is a future feature,
// but some of the backend database functionality is already implemented here.

/* istanbul ignore next */
export const getBankTransferBy = async (key: string, value: any): Promise<BankTransfer> =>
  (await getBy(BANK_TRANSFER_TABLE, key, value)) as BankTransfer;

export const getBankTransfersBy = async (key: string, value: any): Promise<BankTransfer[]> =>
  (await getAllBy(BANK_TRANSFER_TABLE, key, value)) as BankTransfer[];

export const getBankTransfersByUserId = async (userId: string): Promise<BankTransfer[]> => await getBankTransfersBy("userId", userId);

/* istanbul ignore next */
export const createBankTransfer = async (bankTransferDetails: BankTransferPayload) => {
  const bankTransfer: BankTransfer = {
    id: shortid(),
    uuid: v4(),
    ...bankTransferDetails,
    createdAt: new Date(),
    modifiedAt: new Date(),
  };

  const savedBankTransfer = await saveBankTransfer(bankTransfer);
  return savedBankTransfer;
};

/* istanbul ignore next */
const saveBankTransfer = async (bankTransfer: BankTransfer): Promise<BankTransfer> => {
  const database = await getDb();
  await database.collection(BANK_TRANSFER_TABLE).insertOne(bankTransfer);

  // manual lookup after banktransfer created
  return await getBankTransferBy("id", bankTransfer.id);
};

// Transaction

export const getTransactionBy = async (key: string, value: any): Promise<Transaction> => (await getBy(TRANSACTION_TABLE, key, value)) as Transaction;

export const getTransactionById = async (id: string): Promise<Transaction> => await getTransactionBy("id", id);

export const getTransactionsByObj = async (query: object): Promise<Transaction[]> => (await getAllByObj(TRANSACTION_TABLE, query)) as Transaction[];

export const getTransactionByIdForApi = async (id: string): Promise<TransactionResponseItem> =>
  formatTransactionForApiResponse(await getTransactionBy("id", id));

export const getTransactionsForUserForApi = async (userId: string, query?: object): Promise<TransactionResponseItem[]> => {
  const transactions = await getTransactionsForUserByObj(userId, query || {});
  return await formatTransactionsForApiResponse(transactions);
};

export const getFullNameForUser = async (userId: User["id"]): Promise<string> => {
  const user = await getUserById(userId);
  return formatFullName(user);
};

export const formatTransactionForApiResponse = async (
  transaction: Transaction
): Promise<TransactionResponseItem> => {
  const receiver = await getUserById(transaction.receiverId);
  const sender = await getUserById(transaction.senderId);

  const receiverName = await getFullNameForUser(transaction.receiverId);
  const senderName = await getFullNameForUser(transaction.senderId);
  const likes = (await getLikesByTransactionId(transaction.id)) as Like[];
  const comments = (await getCommentsByTransactionId(transaction.id)) as Comment[];

  return {
    receiverName,
    senderName,
    receiverAvatar: receiver.avatar,
    senderAvatar: sender.avatar,
    likes,
    comments,
    ...transaction,
  };
};

export const formatTransactionsForApiResponse = async (
  transactions: Transaction[]
): Promise<TransactionResponseItem[]> => {
  const formatted = await Promise.all(
    transactions.map((transaction) => formatTransactionForApiResponse(transaction))
  );
  return orderBy(
    [(transaction: Transaction) => new Date(transaction.modifiedAt)],
    ["desc"],
    formatted
  );
};

export const getAllTransactionsForUserByObj = async (userId: string, query?: object): Promise<Transaction[]> => {
  const queryWithoutFilterFields = query && getQueryWithoutFilterFields(query);

  const queryFields = queryWithoutFilterFields || query;

  const queries = [
    {
      receiverId: userId,
      ...queryFields,
    },
    {
      senderId: userId,
      ...queryFields,
    },
  ];

  const results = await Promise.all(queries.map(q => getTransactionsByObj(q)));
  const userTransactions: Transaction[] = cleanMongoDoc<Transaction[]>(results.flat());

  if (query && (hasDateQueryFields(query) || hasAmountQueryFields(query))) {
    const { dateRangeStart, dateRangeEnd } = getDateQueryFields(query);
    const { amountMin, amountMax } = getAmountQueryFields(query);

    return flow(
      transactionsWithinDateRange(dateRangeStart!, dateRangeEnd!),
      transactionsWithinAmountRange(amountMin!, amountMax!)
    )(userTransactions);
  }
  return userTransactions;
};

export const transactionsWithinAmountRange = curry(
  (amountMin: number, amountMax: number, transactions: Transaction[]) => {
    if (!amountMin || !amountMax) {
      return transactions;
    }

    return filter(
      (transaction: Transaction) => inRange(amountMin, amountMax, transaction.amount),
      transactions
    );
  }
);

export const transactionsWithinDateRange = curry(
  (dateRangeStart: string, dateRangeEnd: string, transactions: Transaction[]) => {
    if (!dateRangeStart || !dateRangeEnd) {
      return transactions;
    }

    return filter(
      (transaction: Transaction) =>
        isWithinInterval(new Date(transaction.createdAt), {
          start: new Date(dateRangeStart),
          end: new Date(dateRangeEnd),
        }),
      transactions
    );
  }
);

export const getTransactionsForUserByObj = async (userId: string, query: object): Promise<Transaction[]> => {
  const transactions = await getAllTransactionsForUserByObj(userId, query);
  return uniqBy("id", transactions);
};

export const getContactIdsForUser = async (userId: string): Promise<Contact["id"][]> => {
  const contacts = await getContactsByUserId(userId);
  return contacts.map((c: Contact) => c.contactUserId);
};

export const getTransactionsForUserContacts = async (userId: string, query?: object) => {
  const contactIds = await getContactIdsForUser(userId);
  const results = await Promise.all(
    contactIds.map((contactId) => getTransactionsForUserForApi(contactId, query))
  );
  return uniqBy("id", results.flat());
};

export const getTransactionIds = (transactions: Transaction[]) => map("id", transactions);

export const getContactsTransactionIds = async (userId: string): Promise<Transaction["id"][]> => {
  const transactions = await getTransactionsForUserContacts(userId);
  return getTransactionIds(transactions);
};

export const nonContactPublicTransactions = async (userId: string): Promise<Transaction[]> => {
  const contactsTransactionIds = await getContactsTransactionIds(userId);
  const allPublicTransactions = await getAllPublicTransactions();
  return reject(
    (transaction: Transaction) => includes(transaction.id, contactsTransactionIds),
    allPublicTransactions
  ) as Transaction[];
};

export const getNonContactPublicTransactionsForApi = async (userId: string) => {
  const transactions = await nonContactPublicTransactions(userId);
  return await formatTransactionsForApiResponse(transactions);
};

export const getPublicTransactionsDefaultSort = async (userId: string) => ({
  contactsTransactions: await getTransactionsForUserContacts(userId),
  publicTransactions: await getNonContactPublicTransactionsForApi(userId),
});

export const getPublicTransactionsByQuery = async (userId: string, query: TransactionQueryPayload) => {
  if (query && (hasDateQueryFields(query) || hasAmountQueryFields(query))) {
    const { dateRangeStart, dateRangeEnd } = getDateQueryFields(query);
    const { amountMin, amountMax } = getAmountQueryFields(query);

    const publicTransactions = await getNonContactPublicTransactionsForApi(userId);
    return {
      contactsTransactions: await getTransactionsForUserContacts(userId, query),
      publicTransactions: flow(
        transactionsWithinDateRange(dateRangeStart!, dateRangeEnd!),
        transactionsWithinAmountRange(amountMin!, amountMax!)
      )(publicTransactions),
    };
  } else {
    return {
      contactsTransactions: await getTransactionsForUserContacts(userId),
      publicTransactions: await getNonContactPublicTransactionsForApi(userId),
    };
  }
};

export const resetPayAppBalance = constant(0);

export const debitPayAppBalance = async (user: User, transaction: Transaction) => {
  if (hasSufficientFunds(user, transaction)) {
    const chargeAmount = getChargeAmount(user, transaction);
    await savePayAppBalance(user)(chargeAmount);
  } else {
    /* istanbul ignore next */
    const transferAmount = getTransferAmount(user)(transaction);
    await createBankTransferWithdrawal(user, transaction)(transferAmount);
    const balance = resetPayAppBalance();
    await savePayAppBalance(user)(balance);
  }
};

export const creditPayAppBalance = async (user: User, transaction: Transaction) => {
  const creditAmount = getPayAppCreditedAmount(user, transaction);
  await savePayAppBalance(user)(creditAmount);
};

/* istanbul ignore next */
export const createBankTransferWithdrawal = curry(
  async (sender: User, transaction: Transaction, transferAmount: number) =>
    await createBankTransfer({
      userId: sender.id,
      source: transaction.source,
      amount: transferAmount,
      transactionId: transaction.id,
      type: BankTransferType.withdrawal,
    })
);

export const savePayAppBalance = curry(async (sender: User, balance: number) =>
  await updateUserById(get("id", sender), { balance })
);

export const createTransaction = async (
  userId: User["id"],
  transactionType: "payment" | "request",
  transactionDetails: TransactionPayload
): Promise<Transaction> => {
  const sender = await getUserById(userId);
  const receiver = await getUserById(transactionDetails.receiverId);
  const transaction: Transaction = {
    id: shortid(),
    uuid: v4(),
    source: transactionDetails.source,
    amount: transactionDetails.amount * 100,
    description: transactionDetails.description,
    receiverId: transactionDetails.receiverId,
    senderId: userId,
    privacyLevel: transactionDetails.privacyLevel || sender.defaultPrivacyLevel,
    status: TransactionStatus.pending,
    requestStatus: transactionType === "request" ? TransactionRequestStatus.pending : undefined,
    createdAt: new Date(),
    modifiedAt: new Date(),
  };

  const savedTransaction = await saveTransaction(transaction);

  // if payment, debit sender's balance for payment amount
  if (isPayment(transaction)) {
    await debitPayAppBalance(sender!, transaction);
    await creditPayAppBalance(receiver!, transaction);
    await updateTransactionById(transaction.id, {
      status: TransactionStatus.complete,
    });
    await createPaymentNotification(
      transaction.receiverId,
      transaction.id,
      PaymentNotificationStatus.received
    );
  } else {
    await createPaymentNotification(
      transaction.receiverId,
      transaction.id,
      PaymentNotificationStatus.requested
    );
  }

  return savedTransaction;
};

const saveTransaction = async (transaction: Transaction): Promise<Transaction> => {
  const database = await getDb();
  await database.collection(TRANSACTION_TABLE).insertOne(transaction);

  // manual lookup after transaction created
  return (await getTransactionBy("id", transaction.id));
};

export const updateTransactionById = async (transactionId: string, edits: Partial<Transaction>) => {
  const transaction = await getTransactionBy("id", transactionId);
  const { senderId, receiverId } = transaction;
  const sender = await getUserById(senderId);
  const receiver = await getUserById(receiverId);

  // if payment, debit sender's balance for payment amount
  if (isRequestTransaction(transaction)) {
    await debitPayAppBalance(receiver!, transaction);
    await creditPayAppBalance(sender!, transaction);
    edits.status = TransactionStatus.complete;

    await createPaymentNotification(
      transaction.senderId,
      transaction.id,
      PaymentNotificationStatus.received
    );
  }

  const database = await getDb();
  await database.collection(TRANSACTION_TABLE).updateOne({ id: transactionId }, { $set: edits });
};

// Likes

export const getLikeBy = async (key: string, value: any): Promise<Like> => (await getBy(LIKE_TABLE, key, value)) as Like;
export const getLikesByObj = async (query: object): Promise<Like[]> => (await getAllByObj(LIKE_TABLE, query)) as Like[];

export const getLikeById = async (id: string): Promise<Like> => await getLikeBy("id", id);
export const getLikesByTransactionId = async (transactionId: string) => await getLikesByObj({ transactionId });

export const createLike = async (userId: string, transactionId: string): Promise<Like> => {
  const like = {
    id: shortid(),
    uuid: v4(),
    userId,
    transactionId,
    createdAt: new Date(),
    modifiedAt: new Date(),
  };

  const savedLike = await saveLike(like);
  return savedLike;
};

export const createLikes = async (userId: string, transactionId: string) => {
  const transaction = await getTransactionById(transactionId);
  const { senderId, receiverId } = transaction;

  const like = await createLike(userId, transactionId);

  /* istanbul ignore next */
  if (userId !== senderId || userId !== receiverId) {
    await createLikeNotification(senderId, transactionId, like.id);
    await createLikeNotification(receiverId, transactionId, like.id);
  } else if (userId === senderId) {
    await createLikeNotification(senderId, transactionId, like.id);
  } else {
    await createLikeNotification(receiverId, transactionId, like.id);
  }
};

const saveLike = async (like: Like): Promise<Like> => {
  const database = await getDb();
  await database.collection(LIKE_TABLE).insertOne(like);

  // manual lookup after like created
  return await getLikeById(like.id);
};

// Comments

export const getCommentBy = async (key: string, value: any): Promise<Comment> => (await getBy(COMMENT_TABLE, key, value)) as Comment;
export const getCommentsByObj = async (query: object): Promise<Comment[]> => (await getAllByObj(COMMENT_TABLE, query)) as Comment[];

export const getCommentById = async (id: string): Promise<Comment> => await getCommentBy("id", id);
export const getCommentsByTransactionId = async (transactionId: string) =>
  await getCommentsByObj({ transactionId });

export const createComment = async (userId: string, transactionId: string, content: string): Promise<Comment> => {
  const comment = {
    id: shortid(),
    uuid: v4(),
    content,
    userId,
    transactionId,
    createdAt: new Date(),
    modifiedAt: new Date(),
  };

  const savedComment = await saveComment(comment);
  return savedComment;
};

export const createComments = async (userId: string, transactionId: string, content: string) => {
  const transaction = await getTransactionById(transactionId);
  const { senderId, receiverId } = transaction;

  const comment = await createComment(userId, transactionId, content);

  /* istanbul ignore next */
  if (userId !== senderId || userId !== receiverId) {
    await createCommentNotification(senderId, transactionId, comment.id);
    await createCommentNotification(receiverId, transactionId, comment.id);
  } else if (userId === senderId) {
    await createCommentNotification(senderId, transactionId, comment.id);
  } else {
    await createCommentNotification(receiverId, transactionId, comment.id);
  }
};

const saveComment = async (comment: Comment): Promise<Comment> => {
  const database = await getDb();
  await database.collection(COMMENT_TABLE).insertOne(comment);

  // manual lookup after comment created
  return await getCommentById(comment.id);
};

// Notifications

export const getNotificationBy = async (key: string, value: any): Promise<NotificationType> =>
  (await getBy(NOTIFICATION_TABLE, key, value)) as NotificationType;

export const getNotificationsByObj = async (query: object): Promise<NotificationType[]> =>
  (await getAllByObj(NOTIFICATION_TABLE, query)) as NotificationType[];

export const getUnreadNotificationsByUserId = async (userId: string) => {
  const notifications = await getNotificationsByObj({ userId, isRead: false });
  return await formatNotificationsForApiResponse(notifications);
};

export const createPaymentNotification = async (
  userId: string,
  transactionId: string,
  status: PaymentNotificationStatus
): Promise<PaymentNotification> => {
  const notification: PaymentNotification = {
    id: shortid(),
    uuid: v4(),
    userId: userId,
    transactionId: transactionId,
    status,
    isRead: false,
    createdAt: new Date(),
    modifiedAt: new Date(),
  };

  await saveNotification(notification);
  return notification;
};

export const createLikeNotification = async (
  userId: string,
  transactionId: string,
  likeId: string
): Promise<LikeNotification> => {
  const notification: LikeNotification = {
    id: shortid(),
    uuid: v4(),
    userId: userId,
    transactionId: transactionId,
    likeId: likeId,
    isRead: false,
    createdAt: new Date(),
    modifiedAt: new Date(),
  };

  await saveNotification(notification);
  return notification;
};

export const createCommentNotification = async (
  userId: string,
  transactionId: string,
  commentId: string
): Promise<CommentNotification> => {
  const notification: CommentNotification = {
    id: shortid(),
    uuid: v4(),
    userId: userId,
    transactionId: transactionId,
    commentId: commentId,
    isRead: false,
    createdAt: new Date(),
    modifiedAt: new Date(),
  };

  await saveNotification(notification);
  return notification;
};

const saveNotification = async (notification: NotificationType) => {
  const database = await getDb();
  await database.collection(NOTIFICATION_TABLE).insertOne(notification);
};

export const createNotifications = async (userId: string, notifications: NotificationPayloadType[]) => {
  const results = [];
  for (const item of notifications) {
    if ("status" in item && item.type === NotificationsType.payment) {
      results.push(await createPaymentNotification(userId, item.transactionId, item.status));
    } else if ("likeId" in item && item.type === NotificationsType.like) {
      results.push(await createLikeNotification(userId, item.transactionId, item.likeId));
    } else {
      /* istanbul ignore next */
      if ("commentId" in item) {
        results.push(await createCommentNotification(userId, item.transactionId, item.commentId));
      }
    }
  }
  return results;
};

export const updateNotificationById = async (
  userId: string,
  notificationId: string,
  edits: Partial<NotificationType>
) => {
  const database = await getDb();
  await database.collection(NOTIFICATION_TABLE).updateOne({ id: notificationId }, { $set: edits });
};

export const formatNotificationForApiResponse = async (
  notification: NotificationType
): Promise<NotificationResponseItem> => {
  let userFullName = await getFullNameForUser(notification.userId);
  const transaction = await getTransactionById(notification.transactionId);

  if (isRequestTransaction(transaction)) {
    userFullName = await getFullNameForUser(transaction.senderId);
  }

  if (isLikeNotification(notification)) {
    const like = await getLikeById(notification.likeId);
    userFullName = await getFullNameForUser(like.userId);
  }

  if (isCommentNotification(notification)) {
    const comment = await getCommentById(notification.commentId);
    userFullName = await getFullNameForUser(comment.userId);
  }

  return {
    userFullName,
    ...notification,
  };
};

export const formatNotificationsForApiResponse = async (
  notifications: NotificationType[]
): Promise<NotificationResponseItem[]> => {
  const formatted = await Promise.all(
    notifications.map((notification) => formatNotificationForApiResponse(notification))
  );
  return orderBy(
    [(notification: NotificationResponseItem) => new Date(notification.modifiedAt)],
    ["desc"],
    formatted
  );
};

// dev/test private methods
/* istanbul ignore next */
export const getRandomUser = async () => {
  const users = await getAllUsers();
  return sample(users)!;
};

/* istanbul ignore next */
export const getAllContacts = async (): Promise<Contact[]> => 
  cleanMongoDoc<Contact[]>(await (await getDb()).collection(CONTACT_TABLE).find().toArray());

/* istanbul ignore next */
export const getAllTransactions = async (): Promise<Transaction[]> => 
  cleanMongoDoc<Transaction[]>(await (await getDb()).collection(TRANSACTION_TABLE).find().toArray());

/* istanbul ignore */
export const getBankAccountsByUserId = async (userId: string) => await getBankAccountsBy("userId", userId);

/* istanbul ignore next */
export const getNotificationById = async (id: string): Promise<NotificationType> => await getNotificationBy("id", id);

/* istanbul ignore next */
export const getNotificationsByUserId = async (userId: string) => await getNotificationsByObj({ userId });

/* istanbul ignore next */
export const getBankTransferByTransactionId = async (transactionId: string) =>
  await getBankTransferBy("transactionId", transactionId);

/* istanbul ignore next */
export const getTransactionsBy = async (key: string, value: string) =>
  await getAllBy(TRANSACTION_TABLE, key, value);

/* istanbul ignore next */
export const getTransactionsByUserId = async (userId: string) => await getTransactionsBy("receiverId", userId);

export { initializeDatabase };
export default getDb;
