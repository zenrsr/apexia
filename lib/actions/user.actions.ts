"use server";

import { ID, Query } from "node-appwrite";
import { createAdminClient, createSessionClient } from "../appwrite";
import { cookies } from "next/headers";
import { encryptId, extractCustomerIdFromUrl, parseStringify } from "../utils";
import {
  CountryCode,
  ProcessorTokenCreateRequest,
  ProcessorTokenCreateRequestProcessorEnum,
  Products
} from "plaid";
import { plaidClient } from "../plaid";
import { revalidatePath } from "next/cache";
import { addFundingSource, createDwollaCustomer } from "./dwolla.actions";

const {
  APPWRITE_DATABASE_ID: DATABASE_ID,
  APPWRITE_USER_COLLECTION_ID: USER_COLLECTION_ID,
  APPWRITE_BANK_COLLECTION_ID: BANK_COLLECTION_ID
} = process.env;

export const getUserInfo = async ({ userId }: getUserInfoProps) => {
  try {
    const { database } = await createAdminClient();
    const user = await database.listDocuments(
      DATABASE_ID!,
      USER_COLLECTION_ID!,
      [Query.equal("userId", [userId])]
    );
    // console.log("user from getUserinfo:", user);
    return parseStringify(user.documents[0]);
  } catch (error) {
    console.error("Error :", error);
  }
};

export const signIn = async ({ email, password }: signInProps) => {
  try {
    const { account } = await createAdminClient();

    const session = await account.createEmailPasswordSession(email, password);

    cookies().set("appwrite-session", session.secret, {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: true
    });
    const user = await getUserInfo({ userId: session.userId });

    return parseStringify(user);
  } catch (error) {
    console.error("Error:", error);
  }
};

export const signUp = async ({ password, ...userData }: SignUpParams) => {
  let newUserAccount;
  try {
    // create a user account
    const { email, firstName, lastName } = userData;
    const { account, database } = await createAdminClient();

    newUserAccount = await account.create(
      ID.unique(),
      email,
      password,
      `${firstName} ${lastName}`
    );

    if (!newUserAccount) throw Error("Error creating a user account");

    const dwollaCustomerUrl = await createDwollaCustomer({
      ...userData,
      type: "personal"
    });

    if (!dwollaCustomerUrl) throw Error("Error creating a Dwolla customer");

    const dwollaCustomerId = extractCustomerIdFromUrl(dwollaCustomerUrl);

    const newUser = await database.createDocument(
      DATABASE_ID!,
      USER_COLLECTION_ID!,
      ID.unique(),
      {
        ...userData,
        userId: newUserAccount.$id,
        dwollaCustomerId,
        dwollaCustomerUrl
      }
    );

    const session = await account.createEmailPasswordSession(email, password);

    cookies().set("appwrite-session", session.secret, {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: true
    });

    // we use this stringy function because naturally we can't pass large user objects thru cookies thats why we use this utility function
    return parseStringify(newUser);
  } catch (error) {
    console.error("Error:", error);
  }
};

export async function getLoggedInUser() {
  try {
    const { account } = await createSessionClient();
    const result = await account.get();

    const user = await getUserInfo({ userId: result.$id });

    return parseStringify(user);
  } catch (error) {
    return null;
  }
}

export const logoutAccount = async () => {
  try {
    const { account } = await createSessionClient();
    cookies().delete("appwrite-session");
    await account.deleteSession("current");
  } catch (error) {
    console.error("Error:", error);
    return null;
  }
};

export const createLinkToken = async (user: User) => {
  try {
    const tokenParams = {
      user: {
        client_user_id: user.$id
      },
      client_name: `${user.firstName} ${user.lastName}`,
      products: ["auth"] as Products[],
      language: "en",
      country_codes: ["US"] as CountryCode[]
    };

    const response = await plaidClient.linkTokenCreate(tokenParams);
    return parseStringify({ linkToken: response.data.link_token });
  } catch (error) {
    console.log("Error: ", error);
  }
};

export const createBankAccount = async ({
  userId,
  bankId,
  accountId,
  accessToken,
  fundingSourceUrl,
  sharableId
}: createBankAccountProps) => {
  try {
    const { database } = await createAdminClient();
    const bankAccount = await database.createDocument(
      DATABASE_ID!,
      BANK_COLLECTION_ID!,
      ID.unique(),
      {
        userId,
        bankId,
        accountId,
        accessToken,
        fundingSourceUrl,
        sharableId
      }
    );

    return parseStringify(bankAccount);
  } catch (error) {
    console.error("Error: ", error);
  }
};

export const exchangePublicToken = async ({
  publicToken,
  user
}: exchangePublicTokenProps) => {
  try {
    //exchanging the public token for an access token
    const response = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken
    });
    const accessToken = response.data.access_token;
    const itemId = response.data.item_id;

    // get account info from plaid through access token
    const accountsResponse = await plaidClient.accountsGet({
      access_token: accessToken
    });

    const accountData = accountsResponse.data.accounts[0];

    // create a processor token fro dwolla using the access token and account ID
    const request: ProcessorTokenCreateRequest = {
      access_token: accessToken,
      account_id: accountData.account_id,
      processor: "dwolla" as ProcessorTokenCreateRequestProcessorEnum
    };

    const processorTokenResponse = await plaidClient.processorTokenCreate(
      request
    );

    const processorToken = processorTokenResponse.data.processor_token;

    // Create a funding source URL for the account using the Dwolla customer ID, processor token and Bank name

    const fundingSourceUrl = await addFundingSource({
      dwollaCustomerId: user.dwollaCustomerId,
      processorToken,
      bankName: accountData.name
    });

    if (!fundingSourceUrl) throw Error;

    await createBankAccount({
      userId: user.$id,
      bankId: itemId,
      accountId: accountData.account_id,
      accessToken,
      fundingSourceUrl,
      sharableId: encryptId(accountData.account_id)
    });

    revalidatePath("/"); // revalidate tha path to reflect changes

    return parseStringify({
      publicTokenExchange: "complete"
    });
  } catch (error) {
    console.error("Error occurred while exchanging tokens:", error);
  }
};

export const getBanks = async ({ userId }: getBanksProps) => {
  try {
    const { database } = await createAdminClient();
    const banks = await database.listDocuments(
      DATABASE_ID!,
      BANK_COLLECTION_ID!,
      [Query.equal("userId", [userId])]
    );

    // console.log("banks from getBanks:", banks);

    return parseStringify(banks.documents);
  } catch (error) {
    console.error("Error :", error);
  }
};

export const getBank = async ({ documentId }: getBankProps) => {
  try {
    const { database } = await createAdminClient();
    const bank = await database.listDocuments(
      DATABASE_ID!,
      BANK_COLLECTION_ID!,
      [Query.equal("$id", [documentId])]
    );
    // console.log("bank from getBank:", bank);
    return parseStringify(bank.documents[0]);
  } catch (error) {
    console.error("Error :", error);
  }
};

export const getBankByAccountId = async ({
  accountId
}: getBankByAccountIdProps) => {
  try {
    const { database } = await createAdminClient();
    const bank = await database.listDocuments(
      DATABASE_ID!,
      BANK_COLLECTION_ID!,
      [Query.equal("accountId", [accountId])]
    );
    if (bank.total !== 1) return null;
    // console.log("bank from getBank:", bank);
    return parseStringify(bank.documents[0]);
  } catch (error) {
    console.error("Error :", error);
  }
};
