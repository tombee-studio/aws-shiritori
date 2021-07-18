// Copyright 2018-2020Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const AWS = require('aws-sdk');
const buffer = require('buffer');

const ddb = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10', region: process.env.AWS_REGION });
const s3 = new AWS.S3({apiVersion: '2012-08-10', region: process.env.AWS_REGION });

const { TABLE_NAME, S3_BUCKET_NAME } = process.env;

async function checkPassFunction(event) {
  if(!event.backet || !event.filename || !event.target || !event.origin) 
    return "invaild arguments";
  const v = Math.floor(Math.random() * 100);
  
  if(v == 99) {
      return {
          "name": "lose",
          "word": "<string>",
          "translated":"<string>"
      };
  } else if(v > 45) {
      return {
          "name": "ok",
          "word": "<string>",
          "translated":"<string>"
      };
  } else {
      return {
          "name": "again",
          "word": "<string>",
          "translated":"<string>"
      };
  }
};

exports.handler = async event => {
  let connectionId = event.requestContext.connectionId;
  const apigwManagementApi = new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: event.requestContext.domainName + '/' + event.requestContext.stage
  });
  let connectionData = await ddb.scan({
    TableName: TABLE_NAME,
    ProjectionExpression: 'connectionId, #st, #idx, lang',
    ExpressionAttributeNames: {
      "#st": "status",
      "#idx": "index",
    },
  }).promise();

  let current = await ddb.get({
    TableName: process.env.TABLE_NAME,
      Key: {
          "connectionId": connectionId
      },
  }).promise();

  let currentIndex = current.Item.index;
  let nextIndex = current.Item.index + 1 >= connectionData.Items.map(
    status => { return status == "ready"; }).length ? 0 : current.Item.index + 1;

  var params = {
    Bucket: S3_BUCKET_NAME, 
    Key: 'key.webm', 
    Body: buffer.Buffer.from(JSON.parse(event.body).data.result.split(",")[1], 'base64')
  };
  const req = JSON.parse(event.body).data;
  const data = await s3.upload(params).promise();

  const v = await checkPassFunction({
    'backet': data.Bucket,
    'filename': data.Key,
    'target': req.to.lang,
    'origin': req.from.lang,
  });

  if(v.name == 'ok') {
    await apigwManagementApi.postToConnection({
      ConnectionId: event.requestContext.connectionId,
      Data: JSON.stringify({
        "name": "ok"
      })
    }).promise();
    await Promise.all(connectionData.Items.map(({connectionId, index}) => {
      if(index == nextIndex)
        return apigwManagementApi.postToConnection({
          ConnectionId: connectionId,
          Data: JSON.stringify({
            "name": "your_turn",
            "data": connectionData.Items,
            "from": connectionData.Items.find(item => item.index == currentIndex),
            "to": connectionData.Items.find(item => item.index == nextIndex),
            "word": v.word,
            "translated": v.translated
          })
        }).promise();
    else
      return apigwManagementApi.postToConnection({
        ConnectionId: connectionId,
        Data: JSON.stringify({
          "name": "not_your_turn",
          "data": connectionData.Items,
          "current": connectionData.Items.find(item => item.index == nextIndex),
          "word": v.word,
          "translated": v.translated
        })
      }).promise();
    }));
  }
  else if(v.name == 'again') {
    await apigwManagementApi.postToConnection({
      ConnectionId: event.requestContext.connectionId,
      Data: JSON.stringify({
        "name": "again",
        "word": v.word,
        "translated": v.translated
      })
    }).promise();
    await Promise.all(connectionData.Items.map(({connectionId, index}) => {
      if(index == currentIndex)
        return apigwManagementApi.postToConnection({
          ConnectionId: connectionId,
          Data: JSON.stringify({
            "name": "your_turn",
            "data": connectionData.Items,
            "from": connectionData.Items.find(item => item.index == currentIndex),
            "to": connectionData.Items.find(item => item.index == nextIndex),
            "word": v.word,
            "translated": v.translated
          })
        }).promise();
    else
      return apigwManagementApi.postToConnection({
        ConnectionId: connectionId,
        Data: JSON.stringify({
          "name": "not_your_turn",
          "data": connectionData.Items,
          "current": connectionData.Items.find(item => item.index == nextIndex),
          "word": v.word,
          "translated": v.translated
        })
      }).promise();
    }));
  }
  return { statusCode: 200, body: 'Data sent.' };
};
