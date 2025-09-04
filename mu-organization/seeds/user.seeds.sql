
INSERT INTO "User" (
  "uniqRef",
  "slug",
  "username",
  "email",
  "passwordHash",
  "plan",
  "profileID",
  "userKind",
  "lastLogin",
  "loginDuration",
  "twoFactorEnabled",
  "rsaPublicKey",
  "passwordResetToken",
  "state",
  "createdAt"
) VALUES 
  ('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'john-doe-1', 'johnny_d', 'john.doe@example.com', 'hash1', 'basic', 2, 'administrator', NOW(), 2419200, false, NULL, NULL, 'online', NOW()),
  ('3fa85f64-5717-4562-b3fc-2c963f66afa6', 'jane-doe-2', 'jane_d', 'jane.doe@example.com', 'hash2', 'basic', 2, 'moderator', NOW(), 2419200, false, NULL, NULL, 'online', NOW()),
  ('e4eaaaf2-d142-11e1-b3e4-080027620cdd', 'emily-jones-3', 'emily_j', 'emily.jones@example.com', 'hash3', 'premium', 3, 'robot', NOW(), 2419200, true, NULL, NULL, 'online', NOW()),
  ('031b95e0-6ffa-424c-9ad8-3bb6c0954c78', 'michael-brown-4', 'mike_b', 'michael.brown@example.com', 'hash4', 'basic', 4, 'client', NOW(), 2419200, false, NULL, NULL, 'online', NOW()),
  ('a0d3334f-5b5d-450b-9b44-a4f8f4511a76', 'chloe-taylor-5', 'chloe_t', 'chloe.taylor@example.com', 'hash5', 'premium', 5, 'administrator', NOW(), 2419200, true, NULL, NULL, 'online', NOW()),
  ('5ef5f676-a58b-4b70-9fdf-1b50768e4871', 'david-smith-6', 'david_s', 'david.smith@example.com', 'hash6', 'basic', 6, 'client', NOW(), 2419200, false, NULL, NULL, 'online', NOW()),
  ('7c9a2a8f-16a0-4d91-afe9-ea3e2a3d0b17', 'sarah-johnson-7', 'sarah_j', 'sarah.johnson@example.com', 'hash7', 'premium', 7, 'analyzer', NOW(), 2419200, true, NULL, NULL, 'online', NOW()),
  ('0ab1c980-eb9c-4b0c-9a66-1a1d3e8a9bef', 'james-wilson-8', 'james_w', 'james.wilson@example.com', 'hash8', 'basic', 8, 'client', NOW(), 2419200, false, NULL, NULL, 'online', NOW()),
  ('9f1a4b49-6e79-41e8-9a1b-4c7ae07a04a8', 'sophia-martinez-9', 'sophia_m', 'sophia.martinez@example.com', 'hash9', 'premium', 9, 'developer', NOW(), 2419200, true, NULL, NULL, 'online', NOW()),
  ('6e115adc-5f24-4ffc-ba9c-cd5e56b0f9a2', 'daniel-garcia-10', 'daniel_g', 'daniel.garcia@example.com', 'hash10', 'basic', 10, 'client', NOW(), 2419200, false, NULL, NULL, 'online', NOW());
