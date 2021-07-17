// Copyright 2018-2020Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const AWS = require('aws-sdk');

const ddb = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10', region: process.env.AWS_REGION });

const { TABLE_NAME } = process.env;

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

  await Promise.all(connectionData.Items.map(({connectionId, index}) => {
    if(index == nextIndex)
      return apigwManagementApi.postToConnection({
        ConnectionId: connectionId,
        Data: JSON.stringify({
          "name": "your_turn",
          "data": connectionData.Items,
          "from": connectionData.Items.find(item => item.index == currentIndex),
          "to": connectionData.Items.find(item => item.index == nextIndex)
        })
      }).promise();
    else
      return apigwManagementApi.postToConnection({
        ConnectionId: connectionId,
        Data: JSON.stringify({
          "name": "not_your_turn",
          "data": connectionData.Items
        })
      }).promise();
  }));
  return { statusCode: 200, body: 'Data sent.' };
};
