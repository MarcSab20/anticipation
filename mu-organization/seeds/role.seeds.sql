--- Some seeds for Role table
INSERT INTO "Role" (
  "uniqRef",
  "slug",
  "authorID",
  "roleName",
  "description",
  "permissions",
  "state",
  "createdAt"
) VALUES 
  ('3fa85f64-5717-4562-b3fc-2c963f66afa6', 'administrator', 10 'Administrator', 'Has full system access', '{"general":"all_permissions"}', 'online', NOW()),
  ('e14b5f68-3ef6-4d29-9c10-7c5462b5ffe3', 'moderator', 10 'Moderator', 'Can manage user posts and comments', '{"general":"moderate_permissions"}', 'online', NOW()),
  ('a6edc906-2f9f-5fb2-a373-efac406f0ef2', 'editor', 10 'Editor', 'Can edit and publish content', '{"general":"edit_permissions"}', 'online', NOW()),
  ('d3dc9dbd-1c54-4e75-b41b-9e24e9bf5067', 'viewer', 10 'Viewer', 'Can view content', '{"general":"view_permissions"}', 'online', NOW()),
  ('0dbb4aa7-1537-4c60-9a8b-8170c8e78b30', 'guest', 10 'Guest', 'Has limited access', '{"general":"guest_permissions"}', 'online', NOW());
