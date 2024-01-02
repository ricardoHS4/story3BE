/* eslint-disable max-len */
/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import {onRequest} from "firebase-functions/v2/https";
import * as functions from "firebase-functions";
import * as logger from "firebase-functions/logger";
import OpenAI from "openai";
import axios from "axios";

export const helloWorld = onRequest((request, response) => {
  logger.info("Hello logs!", {structuredData: true});
  response.send("Hello from Firebase!");
});

export const gptJsonMode = onRequest(
  {secrets: ["OPENAI_API_KEY"]},
  async (request, response) => {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo-1106",
      response_format: {type: "json_object"},
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant designed to output JSON.",
        },
        {
          role: "user",
          content: request.body.message,
        },
      ],
    });

    const message = completion.choices[0].message;

    console.log(message);
    response.send(message.content);
  }
);

export const gptNormalMode = onRequest(
  {secrets: ["OPENAI_API_KEY"]},
  async (request, response) => {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo-1106",
      messages: [
        {
          role: "user",
          content: request.body.message,
        },
      ],
    });

    const message = completion.choices[0].message;

    console.log(message);
    response.send(message.content);
  }
);

export const generateStory = onRequest(
  {secrets: ["OPENAI_API_KEY"]},
  async (request, response) => {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const body = request.body;
    const genres: string | undefined = body.genres;
    const topics: string | undefined = body.topics;
    const childs: number | undefined = body.childs;
    const deep: number | undefined = body.deep;
    const extra: string | undefined = body.extra;

    if (
      genres == undefined ||
      topics == undefined ||
      childs == null ||
      deep == null
    ) {
      response.status(400).json({
        message: `There is some missing parameter, please include
         genres, topics, childs and deep`,
      });
    }

    let message: string =
      "Please create an interactive story of the following genres: \n" +
      genres +
      " \nAnd of the following topics: \n" +
      topics;

    message +=
      " \nWe will have a basic data model named 'twist' which " +
      "will contain a 'title' of no more than 80 chars and a 'body' of no " +
      "more than 1200 chars. Each twist contain a fraction of the story and " +
      "below each twist there can be more twists which will represent " +
      "decisions or paths that the reader can choose. \nEach twist will " +
      "have a name containing the names of all of its parent twists, and " +
      "it's own twist number, starting from twist '0' which will contain " +
      "the plot. Below tiwst '0' we will have twist '00', '01', '02' and " +
      "so on, depending on how many childs for each twist we determine. " +
      "Then at a third level we will have twists '000', '001', '002', " +
      "and so on. \nPlease deliver a story with ";

    message += childs?.toString();
    message +=
      " child twists for each of the twists and " + "a maximun deep level of ";
    message += deep?.toString();
    message +=
      " twists. \nI need you todeliver a JSON that has a key " +
      "for each of the twists names. Twist names must only include numbers";
    if (extra != undefined) {
      message += "Please also consider the following:\n";
      message += extra;
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo-1106",
      response_format: {type: "json_object"},
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant designed to output JSON.",
        },
        {
          role: "user",
          content: message,
        },
      ],
    });

    const storyJson = completion.choices[0].message;

    console.log(storyJson);
    response.send(storyJson.content);
  }
);

export const uploadStory = onRequest(
  {secrets: ["STORY3TOKEN"]},
  async (request, response) => {
    const token = process.env.STORY3TOKEN;
    const baseUrl = "https://story3.com/api/v2/";
    const body = request.body;
    const hashIdsMap: {[key: string]: unknown} = {};

    for (const key in body) {
      if (key != undefined) {
        const value = body[key];
        if (key == "0") {
          const twistRes = await axios.post(baseUrl + "stories", value, {
            headers: {
              "x-auth-token": token,
            },
          });

          hashIdsMap[key] = twistRes.data.hashId;
        } else {
          const parentKey = key.substring(0, key.length - 1);

          const twistRes = await axios.post(
            baseUrl + "twists",
            {hashParentId: hashIdsMap[parentKey], isExtraTwist: true, ...value},
            {
              headers: {
                "x-auth-token": token,
              },
            }
          );
          hashIdsMap[key] = twistRes.data.hashId;
        }
      }
    }
    response.send("OK");
  }
);

export const generateStoryV2 = functions
  .runWith({
    timeoutSeconds: 300, // Set the timeout to 5 minutes (300 seconds)
    secrets: ["OPENAI_API_KEY"],
  })
  .https.onRequest(async (request, response) => {
    // Your function logic here
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const body = request.body;
    const genres: string | undefined = body.genres;
    const topics: string | undefined = body.topics;
    const childs: number | undefined = body.childs;
    const deep: number | undefined = body.deep;
    const extra: string | undefined = body.extra;

    let storyJson = {};

    if (
      genres == undefined ||
      topics == undefined ||
      childs == undefined ||
      deep == undefined
    ) {
      response.status(400).json({
        message:
          "There is some missing parameter, please include" +
          "genres, topics, childs and deep",
      });
    }

    let initialMessage = `
    Consider a data model named 'twist' which represent a fraction of a story and only consist of a parameter 'title' of no more than 80 chars and a parameter 'body' of no more than 1200 chars.
    Please generate a twist containing the exposition of a story of the following genres: ${genres}
    And the following topics: ${topics}
    I need you todeliver a JSON that has a key '0' containing the generated twist.`;

    if (extra != undefined) {
      initialMessage += `Please also consider the following: 
      ${extra}`;
    }

    const initialConv: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: "You are a helpful assistant designed to output JSON.",
      },
      {
        role: "user",
        content: initialMessage,
      },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo-1106",
      response_format: {type: "json_object"},
      messages: initialConv,
    });

    const initialResponse = completion.choices[0].message;
    const rootStoryAsJson = JSON.parse(initialResponse.content ?? "");

    storyJson = {...storyJson, ...rootStoryAsJson};

    const secondConv: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      ...initialConv,
      initialResponse,
    ];

    await generateTwists(childs ?? 0, deep ?? 0, 1, "0", secondConv);

    response.send(storyJson);

    // eslint-disable-next-line require-jsdoc
    async function generateTwists(
      childs: number,
      maxDeep: number,
      currentDeep: number,
      currentTwist: string,
      currentConversation: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
    ) {
      const keys: string[] = [];
      for (let x = 0; x < childs; x++) {
        keys.push(`"${currentTwist}${x.toString()}"`);
      }
      const keysString = keys.join(", ");
      const newMessage = `For twist ${currentTwist} please generate ${childs} more twists, each of them will represent a different way to continue twist ${currentTwist}.
I need you todeliver a JSON that has the keys ${keysString}, each containing a twist`;

      const newConv: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        ...currentConversation,
        {
          role: "user",
          content: newMessage,
        },
      ];

      console.log("Aqui la conv: ", newConv);

      const newCompletion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo-1106",
        response_format: {type: "json_object"},
        messages: newConv,
      });

      const newResponse = newCompletion.choices[0].message;
      const twistsAsJson = JSON.parse(newResponse.content ?? "");
      console.log("Aqui la resp: ", twistsAsJson);
      storyJson = {...storyJson, ...twistsAsJson};

      const finalConv: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        ...newConv,
        newResponse,
      ];

      if (currentDeep < maxDeep - 1) {
        const promiseArray = [];
        for (let x = 0; x < childs; x++) {
          promiseArray.push(
            generateTwists(
              childs,
              maxDeep,
              currentDeep + 1,
              currentTwist + x.toString(),
              finalConv
            )
          );
        }
        await Promise.all(promiseArray);
      }
    }
  });
