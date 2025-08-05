// test/test-check-access.js
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

// Charger le fichier proto
const packageDefinition = protoLoader.loadSync(
  path.resolve(__dirname, '../protos/authorization.proto'),
  {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  }
);

const authProto = grpc.loadPackageDefinition(packageDefinition).authorization;
const client = new authProto.AuthorizationService(
  'localhost:50050',
  grpc.credentials.createInsecure()
);

// Requête de test
const testRequest = {
  userId: 'test-user-1',
  resourceId: 'document-123',
  resourceType: 'Document',
  action: 'read',
  userAttributes: {
    department: 'IT'
  },
  resourceAttributes: {
    owner: 'test-user-1',
    confidential: false
  }
};

// Exécuter le test
console.log('Testing gRPC CheckAccess...');
console.log('Request:', JSON.stringify(testRequest, null, 2));

client.CheckAccess(testRequest, (err, response) => {
  if (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
  
  console.log('Response:', JSON.stringify(response, null, 2));
  process.exit(0);
});
