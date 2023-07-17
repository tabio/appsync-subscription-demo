import { defaultProvider } from "@aws-sdk/credential-provider-node";
import fetch from "cross-fetch";
import { SignatureV4 } from "@aws-sdk/signature-v4";
import { HttpRequest } from "@aws-sdk/protocol-http";
import { Sha256 } from "@aws-crypto/sha256-universal";
import { z } from "zod";

interface Params {
  notificationId: string;
  companyId: string;
}

const REGEX_NOTIFICATION_ID = /^Service:\d+$/;
const REGEX_COMPANY_ID = /^Company:\d+$/;
const schema = z.object({
  notificationId: z.string().regex(REGEX_NOTIFICATION_ID),
  companyId: z.string().regex(REGEX_COMPANY_ID),
});

exports.handler = async (event: Params, context: any) => {
  let statusCode = 200;
  let input: Params;
  try {
    input = schema.parse(event);
  } catch (e) {
    console.error(e);
    statusCode = 400;
    return {
      statusCode,
      body: JSON.stringify(e),
    };
  }

  const uri = process.env.APPSYNC_URL!;
  const bodyItem = {
    query: `
      mutation createNotification($createNotificationInput: CreateNotificationInput!) {
        createNotification(input: $createNotificationInput) {
          notificationId
          companyId
        }
      }
    `,
    operationName: "createNotification",
    variables: {
      createNotificationInput: {
        notificationId: input!.notificationId,
        companyId: input!.companyId,
      },
    },
  };

  const apiUrl = new URL(uri);
  const _signatureV4 = new SignatureV4({
    service: "appsync",
    region: "ap-northeast-1",
    credentials: defaultProvider(),
    sha256: Sha256,
  });
  const httpRequest = new HttpRequest({
    headers: {
      "content-type": "application/json",
      host: apiUrl.host,
    },
    body: JSON.stringify(bodyItem),
    hostname: apiUrl.hostname,
    method: "POST",
    path: apiUrl.pathname,
  });
  let responseBody;
  try {
    const { headers, body, method } = await _signatureV4.sign(httpRequest);
    const res = await fetch(uri, {
      headers,
      body,
      method,
    });
    responseBody = await res.json();
    if (responseBody.errors) {
      statusCode = 400;
    }
  } catch (error) {
    statusCode = 500;
    console.error(error);
  }
  return {
    statusCode,
    body: JSON.stringify(responseBody),
  };
};
