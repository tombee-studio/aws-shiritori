// Copyright 2018-2020Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const AWS = require('aws-sdk');

const ddb = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10', region: process.env.AWS_REGION });

const { TABLE_NAME } = process.env;

exports.handler = async event => {
  let connectionFromId = event.requestContext.connectionId;
  let connectionData;
  let langs = ['ja', 'en', 'it'];

  try {
    connectionData = await ddb.scan({
      TableName: TABLE_NAME,
      ProjectionExpression: 'connectionId'
    }).promise();
  } catch (e) {
    return { statusCode: 500, body: e.stack };
  }

  const apigwManagementApi = new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: event.requestContext.domainName + '/' + event.requestContext.stage
  });

  var params = {
    TableName: process.env.TABLE_NAME,
    Key: {
        "connectionId": connectionFromId
    },
    UpdateExpression: "set #st = :r",
    ExpressionAttributeNames: {
      '#st' : 'status'
    },
    ExpressionAttributeValues: {
        ":r": "ready"
    },
    ReturnValues:"UPDATED_NEW"
  };

  await ddb.update(params).promise();

  var params = {
    TableName: process.env.TABLE_NAME,
    Key: {
        "connectionId": connectionFromId
    },
    UpdateExpression: "set lang = :l",
    ExpressionAttributeValues: {
      ":l": langs[Math.floor(Math.random() * langs.length)]
    },
    ReturnValues:"UPDATED_NEW"
  };

  await ddb.update(params).promise();

  connectionData = await ddb.scan({
    TableName: TABLE_NAME,
    ProjectionExpression: 'connectionId, #st, #idx, lang',
    ExpressionAttributeNames: {
      "#st": "status",
      "#idx": "index",
    },
  }).promise();

  if(!(connectionData.Items.every(item => item.status == "ready")
    && connectionData.Items.length > 2)) return { statusCode: 200, body: 'Data sent.' };

  await Promise.all([...Array(connectionData.Items.length).keys()].map(value => {
    var params = {
      TableName: process.env.TABLE_NAME,
      Key: {
          "connectionId": connectionData.Items[value].connectionId
      },
      UpdateExpression: "set #idx = :r",
      ExpressionAttributeNames: {
        '#idx' : 'index'
      },
      ExpressionAttributeValues: {
          ":r": value
      },
      ReturnValues:"UPDATED_NEW"
    };
    return ddb.update(params).promise();
  }));

  connectionData = await ddb.scan({
    TableName: TABLE_NAME,
    ProjectionExpression: 'connectionId, #st, #idx, lang',
    ExpressionAttributeNames: {
      "#st": "status",
      "#idx": "index",
    },
  }).promise();

  const postCalls = connectionData.Items.map(async ({ connectionId, index }) => {
    try {
      if(index == 0) {
        await apigwManagementApi.postToConnection({
          ConnectionId: connectionId,
          Data: JSON.stringify({
            "name": "your_turn",
            "data": connectionData.Items,
            "from": connectionData.Items.find(item => item.index == 0),
            "to": connectionData.Items.find(item => item.index == 1)
          })
        }).promise();
      } else {
        await apigwManagementApi.postToConnection({
          ConnectionId: connectionId,
          Data: JSON.stringify({
            "name": "not_your_turn",
            "data": connectionData.Items
          })
        }).promise();
      }
    } catch (e) {
      if (e.statusCode === 410) {
        console.log(`Found stale connection, deleting ${connectionId}`);
        await ddb.delete({ TableName: TABLE_NAME, Key: { connectionId } }).promise();
      } else {
        throw e;
      }
    }
  });

  try {
    await Promise.all(postCalls);
  } catch (e) {
    return { statusCode: 500, body: e.stack };
  }
  return { statusCode: 200, body: 'Data sent.' };
};
