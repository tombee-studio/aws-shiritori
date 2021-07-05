// Copyright 2018-2020Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const AWS = require('aws-sdk');

const ddb = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10', region: process.env.AWS_REGION });

const { TABLE_NAME } = process.env;

exports.handler = async event => {
  let connectionFromId = event.requestContext.connectionId;
  let connectionData;
  
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

  ddb.update(params, function(err, data) {
    if (err) {
      console.error("Unable to update item. Error JSON:", JSON.stringify(err, null, 2));
    } else {
      console.log("UpdateItem succeeded:", JSON.stringify(data, null, 2));
    }
  });

  return { statusCode: 200, body: 'Data sent.' };
};
