/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import {onRequest} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import OpenAI from "openai";
import axios from "axios";

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

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

    message += ` \nWe will have a basic data model named 'twist' which 
    will contain a 'title' of no more than 80 chars and a 'body' of no 
    more than 1200 chars. Each twist contain a fraction of the story and 
    below each twist there can be more twists which will represent 
    decisions or paths that the reader can choose. \nEach twist will 
    have a name containing the names of all of its parent twists, and 
    it's own twist number, starting from twist '0' which will contain 
    the plot. Below tiwst '0' we will have twist '00', '01', '02' and 
    so on, depending on how many childs for each twist we determine. 
    Then at a third level we will have twists '000', '001', '002', 
    and so on. \nPlease deliver a story with `;

    message += childs?.toString();
    message += ` child twists for each of the twists and 
    a maximun deep level of `;
    message += deep?.toString();
    message += ` twists. \nI need you todeliver a JSON that has 
    a key for each of the twists names. Twist names must only include numbers"`;
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

    const tiwst0 = {
      "title": "Prueba de title desde API",
      "body": `Y este es el body desde la PI y debe ser de al menos
       40 caracteres, creo`,
    };

    const twist0res = await axios.post(baseUrl + "stories", tiwst0, {
      headers: {
        "x-auth-token": token,
      },
    });

    // const body = request.body;
    // const genres: string | undefined = body.genres;

    response.send(twist0res);
  }
);
