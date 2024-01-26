/* eslint-disable require-jsdoc */
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
import OpenAI from "openai";
import axios from "axios";

const gptModel = "gpt-3.5-turbo-1106";

interface LooseObject {
  [key: string]: any;
}

/**
 * Uploads an story to Story3.
 *
 * @param {Object} body - JSON of the story containing the a key for each of the twists.
 * @returns {Object} - Returns a JSON containing the hashIdsMap of all of the uploaded twists.
 */

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
    response.send(hashIdsMap);
  }
);

/**
 * Sends to analyze the twists of all the provided hashIds.
 *
 * @param {Object} body - JSON of the hashIds.
 */
export const publishStory = onRequest(
  {secrets: ["STORY3TOKEN"]},
  async (request, response) => {
    const token = process.env.STORY3TOKEN;
    const baseUrl = "https://story3.com/api/v2/";
    const body = request.body;

    for (const key in body) {
      if (key != undefined) {
        const hashId = body[key];
        const res = await axios.post(
          baseUrl + "twists/" + hashId + "/publish",
          {},
          {
            headers: {
              "x-auth-token": token,
            },
          }
        );
        console.log(key, res.data);
      }
    }
    response.send("Story sent to analyzing");
  }
);

// This V2 ensures number of twists, deep level and proper JSON key naming
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
      return;
    }

    let initialMessage = `
    Consider a data model named 'twist' which represent a fraction of a story and only consist of a parameter 'title' of no more than 80 chars and a parameter 'body' of no more than 1200 chars.
    I need to create an interactive story where readers will be able to choose how to continue the narrative. The main objective of each twist is to convince the reader to keep reading.
    Please generate a twist containing the exposition for a story of the following genres: ${genres}
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
      model: gptModel,
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
        model: gptModel,
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
          let newChilds = 2;
          if (currentDeep > 3) {
            newChilds = 1;
          }
          promiseArray.push(
            generateTwists(
              newChilds,
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

/**
 * Generates an story with multiple branches.
 *
 * @param {string} instructions - How do you require the story to be generated.
 * @param {number} childs - Number of twists per level.
 * @param {number} deep - Number of vertical twists per branch.
 * @param {string} extra - Extra instructions.
 * @returns {Object} - Returns a JSON containing the generated story, ready to be used with the 'uploadStory' endpoint.
 */

export const generateStoryV3 = functions
  .runWith({
    timeoutSeconds: 540,
    secrets: ["OPENAI_API_KEY"],
  })
  .https.onRequest(async (request, response) => {
    // Your function logic here
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const body = request.body;
    const instructions: string | undefined = body.instructions;
    const childs: number | undefined = body.childs;
    const deep: number = body.deep ?? 0;
    const extra: string | undefined = body.extra;

    let storyJson = {};
    let gptCalls = 0;

    if (
      childs == undefined ||
      deep == 0
    ) {
      response.status(400).json({
        message:
          "There is some missing parameter, please include" +
          "genres, topics, childs and deep",
      });
      return;
    }

    const climax = Math.trunc((deep - 1) / 2);
    const resolution = Math.trunc(deep - 1);

    let initialMessage =
      "Consider a data model named 'twist' which represent a fraction of a story and only consist of a parameter 'title' of no more than 80 chars and a parameter 'body' of no more than 1200 chars." +
      instructions +
      "I need you to provide a JSON object with a key '0', which should contain a twist with the exposition of the story, represented by a nested JSON object with the keys 'title' and 'body.";

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
      model: gptModel,
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
      gptCalls++;
      if (gptCalls >= 35) {
        await new Promise((f) => setTimeout(f, 30 * 1000));
        if (gptCalls > 35) {
          gptCalls = 0;
        }
        gptCalls++;
      }
      console.log("aqui los calls", gptCalls);
      for (let x = 0; x < childs; x++) {
        keys.push(`"${currentTwist}${x.toString()}"`);
      }
      const keysString = keys.join(", ");
      let newMessage = `For twist ${currentTwist} please generate ${childs} more twists, each of them will represent a different way to continue twist ${currentTwist}. Twist 'title' may suggest an action to be taken.
I need you todeliver a JSON that has the keys ${keysString}, each containing a twist`;

      if (currentDeep == climax) {
        console.log("Aqui el climax con current deep: ", currentDeep);
        newMessage = `For twist ${currentTwist} please generate ${childs} more twists, each of them will represent a different way to continue twist ${currentTwist}. Please include the climax of the story on this twists.
I need you todeliver a JSON that has the keys ${keysString}, each containing a twist`;
      }
      if (currentDeep == resolution) {
        console.log("Aqui el resolution con current deep: ", currentDeep);
        newMessage = `For twist ${currentTwist} please generate ${childs} more twists, each of them will represent a different way to continue twist ${currentTwist}. Please include the resolution of the story on this twists.
I need you todeliver a JSON that has the keys ${keysString}, each containing a twist`;
      }

      const newConv: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        ...currentConversation,
        {
          role: "user",
          content: newMessage,
        },
      ];

      // console.log("Aqui la conv: ", newConv);

      const newCompletion = await openai.chat.completions.create({
        model: gptModel,
        response_format: {type: "json_object"},
        messages: newConv,
      });

      const newResponse = newCompletion.choices[0].message;
      const twistsAsJson = JSON.parse(newResponse.content ?? "");
      storyJson = {...storyJson, ...twistsAsJson};

      const finalConv: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        ...newConv,
        newResponse,
      ];

      if (currentDeep < maxDeep - 1) {
        const promiseArray = [];
        for (let x = 0; x < childs; x++) {
          let newChilds = 2;
          if (currentDeep > 3) {
            newChilds = 1;
          }
          promiseArray.push(
            generateTwists(
              newChilds,
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

/**
 * Generates an story with only 1 branch.
 *
 * @param {string} instructions - How do you require the story to be generated.
 * @returns {Object} - Returns a JSON containing the generated story, ready to be used with the 'uploadStory' endpoint.
 */

export const generateLinearRawStory = functions
  .runWith({
    timeoutSeconds: 540,
    secrets: ["OPENAI_API_KEY"],
  })
  .https.onRequest(async (request, response) => {
    const body = request.body;
    const instructions: string | undefined = body.instructions;

    if (instructions == undefined) {
      response.status(400).json({
        message: "There is some missing parameter, please include instructions",
      });
      return;
    }

    const rawStoryJson = {title: "", story: ""};

    const story = await simpleNonJSONPromt(
      instructions,
      process.env.OPENAI_API_KEY ?? ""
    );

    rawStoryJson.story = story;

    const title = await simpleNonJSONPromt(
      "Please generate a title for this story:\n" + story,
      process.env.OPENAI_API_KEY ?? ""
    );

    let storyJson = {
      "0": {title: ""},
    };
    let currentKey = "";
    const splittedStory = story.split("\n\n");

    console.log(splittedStory);

    for (const value of splittedStory) {
      const title: string = await titleGenerator(
        value,
        process.env.OPENAI_API_KEY ?? ""
      );
      currentKey += "0";
      storyJson = {
        ...storyJson,
        ...{[currentKey]: {title: title, body: value}},
      };
    }

    storyJson["0"]["title"] = title ?? "";

    response.send(storyJson);
  });

/**
 * Generates an story with only 3 branches.
 *
 * @param {string} instructions - How do you require the story to be generated.
 * @param {string} instructionsA - Extra instructions for story branch A.
 * @param {string} instructionsB - Extra instructions for story branch B.
 * @param {string} instructionsC - Extra instructions for story branch C.
 * @returns {Object} - Returns a JSON containing the generated story, ready to be used with the 'uploadStory' endpoint.
 */

export const generateSemiLinearStory = functions
  .runWith({
    timeoutSeconds: 540,
    secrets: ["OPENAI_API_KEY"],
  })
  .https.onRequest(async (request, response) => {
    const body = request.body;
    const instructions: string | undefined = body.instructions;
    const instructionsA: string | undefined = body.instructionsA;
    const instructionsB: string | undefined = body.instructionsB;
    const instructionsC: string | undefined = body.instructionsC;

    if (instructions == undefined) {
      response.status(400).json({
        message: "There is some missing parameter, please include instructions",
      });
      return;
    }

    const story = await simpleNonJSONPromt(
      "Generate a story about " + instructions,
      process.env.OPENAI_API_KEY ?? ""
    );

    console.log(story);

    const mainTitle = await titleGenerator(
      story,
      process.env.OPENAI_API_KEY ?? ""
    );

    const splittedStory: string[] = story.split("\n\n");

    const storyIntroArray: string[] = splittedStory.slice(0, 2);
    const storyEndArray: string[] = splittedStory.slice(
      2,
      splittedStory.length
    );

    console.log(storyEndArray);

    const storyIntroString: string = storyIntroArray.join("\n\n");
    const storyEndString: string = storyEndArray.join("\n\n");

    let alt0Array: string[] = [];

    let branch0Title: string | undefined = undefined;

    if (instructionsA != undefined) {
      console.log("ENTRO A INSTRUCTIONS A!!!");
      const alt0 = await simpleNonJSONPromt(
        "Continue this story about " +
          instructions +
          " " +
          (instructionsA ?? "") +
          ": \n" +
          storyIntroString,
        process.env.OPENAI_API_KEY ?? ""
      );
      alt0Array = alt0.split("\n\n");

      branch0Title = await branchTitleGenerator(
        alt0,
        instructionsA,
        process.env.OPENAI_API_KEY ?? ""
      );
    } else {
      branch0Title = await titleGenerator(
        storyEndString,
        process.env.OPENAI_API_KEY ?? ""
      );
    }

    const alt1 = await simpleNonJSONPromt(
      "Continue this story about " +
        instructions +
        " " +
        (instructionsB ?? "") +
        ": \n" +
        storyIntroString,
      process.env.OPENAI_API_KEY ?? ""
    );
    const alt1Array: string[] = alt1.split("\n\n");
    const branch1Title = await branchTitleGenerator(
      alt1,
      instructionsB ?? "",
      process.env.OPENAI_API_KEY ?? ""
    );

    const alt2 = await simpleNonJSONPromt(
      "Continue this story about " +
        instructions +
        " " +
        (instructionsC ?? "") +
        ": \n" +
        storyIntroString,
      process.env.OPENAI_API_KEY ?? ""
    );
    const alt2Array: string[] = alt2.split("\n\n");
    const branch2Title = await branchTitleGenerator(
      alt2,
      instructionsC ?? "",
      process.env.OPENAI_API_KEY ?? ""
    );

    let storyJson: LooseObject = {};

    let currentKey = "";

    for (const value of storyIntroArray) {
      currentKey += "0";
      storyJson = {...storyJson, [currentKey]: {body: value}};
    }

    let baseKey0 = currentKey;
    let baseKey1 = currentKey;
    let baseKey2 = currentKey;

    if (instructionsA != undefined) {
      for (const value of alt0Array) {
        if (value.length > 20) {
          baseKey0 += "0";
          storyJson = {...storyJson, [baseKey0]: {body: value}};
        }
      }
    } else {
      for (const value of storyEndArray) {
        if (value.length > 20) {
          baseKey0 += "0";
          storyJson = {...storyJson, [baseKey0]: {body: value}};
        }
      }
    }

    for (const value of alt1Array) {
      if (value.length > 20) {
        baseKey1 += "1";
        storyJson = {...storyJson, [baseKey1]: {body: value}};
      }
    }
    for (const value of alt2Array) {
      if (value.length > 20) {
        baseKey2 += "2";
        storyJson = {...storyJson, [baseKey2]: {body: value}};
      }
    }

    for (const key in storyJson) {
      if (key != null) {
        const value = storyJson[key]["body"];
        const title: string = await titleGenerator(
          value,
          process.env.OPENAI_API_KEY ?? ""
        );

        storyJson[key]["title"] = title;
      }
    }

    storyJson["0"]["title"] = mainTitle;
    storyJson[currentKey + "0"]["title"] = branch0Title;
    storyJson[currentKey + "1"]["title"] = branch1Title;
    storyJson[currentKey + "2"]["title"] = branch2Title;

    response.send(storyJson);
  });

// eslint-disable-next-line require-jsdoc
async function simpleNonJSONPromt(
  message: string,
  apiKey: string
): Promise<string> {
  const openai = new OpenAI({
    apiKey: apiKey,
  });
  const initialConv: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "user",
      content: message,
    },
  ];
  const completion = await openai.chat.completions.create({
    model: gptModel,
    messages: initialConv,
  });

  const result = completion.choices[0].message.content;

  return result ?? "";
}
// eslint-disable-next-line require-jsdoc
async function simpleJSONPromt(
  message: string,
  apiKey: string
): Promise<LooseObject> {
  const openai = new OpenAI({
    apiKey: apiKey,
  });

  const initialConv: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: "You are a helpful assistant designed to output JSON.",
    },
    {
      role: "user",
      content: message,
    },
  ];
  const completion = await openai.chat.completions.create({
    model: gptModel,
    response_format: {type: "json_object"},
    messages: initialConv,
  });

  const responseContent = completion.choices[0].message.content;
  const contentAsJson = JSON.parse(responseContent ?? "");

  return contentAsJson;
}

// eslint-disable-next-line require-jsdoc
async function titleGenerator(body: string, apiKey: string): Promise<string> {
  const message =
    "Please create a short title of no more than 60 characters that convinces people to read this text: " +
    body +
    ". \nPlease provide a JSON with a 'title' key the created title";

  const contentAsJson = await simpleJSONPromt(message, apiKey);

  return contentAsJson.title;
}

async function branchTitleGenerator(
  body: string,
  instructions: string,
  apiKey: string
): Promise<string> {
  const message =
    "Please create a short title of no more than 60 characters for this text: " +
    body +
    "\n Title should also be related to this other text: " +
    instructions +
    ". \nPlease provide a JSON with a 'title' key the created title";

  const contentAsJson = await simpleJSONPromt(message, apiKey);

  return contentAsJson.title;
}

/**
 * Get analytics of all of my stories.
 *
 * @returns {Object} - Returns a JSON containing the analytics of all of my stories.
 */

// interface StoryData {
//   hashId: string;
// }

export const getAnalytics = onRequest(
  {secrets: ["STORY3TOKEN"]},
  async (request, response) => {
    const token = process.env.STORY3TOKEN;
    const baseUrl = "https://story3.com/api/v2/";

    const resultStories = await axios.get(baseUrl + "stories/my", {
      headers: {
        "x-auth-token": token,
      },
    });

    const stories = resultStories.data;

    console.log("Stories", stories);
    const result: {[key: string]: object} = {};

    for (let i = 0; i < stories.length; i++) {
      console.log("Aqui el I: ", i);
      const tempResult = await axios.get(
        baseUrl + "analytics/" + stories[i].hashId,
        {
          headers: {
            "x-auth-token": token,
          },
        }
      );
      result[stories[i].hashId] = tempResult.data;
    }

    response.send(result);
  }
);
