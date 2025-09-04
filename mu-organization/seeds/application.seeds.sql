--- Some seed for application table
INSERT INTO "Application" (
  "uniqRef",
  "slug",
  "authorID",
  "officialName",
  "developerID",
  "authKey",
  "plan",
  "isOfficialApp",
  "appConfiguration",
  "state",
  "createdAt"
)
VALUES
('a0d12a34-567b-89ab-cdef-0123456789ab', 'messaging-app', 10 'MessagingApp', 2, 'authKey1', 'basic', TRUE, '{}', 'online', NOW()),
('b1c34d56-789e-01fa-23cb-456789abcd12', 'photo-sharing-app', 3, 'PhotoShare', 4, 'authKey2', 'premium', FALSE, '{}', 'online', NOW()),
('c2b45e78-90fa-23db-34ac-678901bcde34', 'task-management-app', 5, 'TaskManager', 6, 'authKey3', 'enterprise', TRUE, '{}', 'online', NOW()),
('d3a56f90-01ab-45eb-56bd-890123cd45e6', 'health-monitoring-app', 7, 'HealthMonitor', 8, 'authKey4', 'standard', FALSE, '{}', 'online', NOW()),
('e4b67890-12bc-56fc-67ce-a1234567b8c9', 'travel-assistant-app', 9, 'TravelAssistant', 10, 'authKey5', 'free', TRUE, '{}', 'online', NOW());
