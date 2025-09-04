
---
INSERT INTO "Place" (
  "uniqRef",
  "slug",
  "authorID",
  "country",
  "region",
  "pstate",
  "city",
  "postalCode",
  "placeKind",
  "addressLine1",
  "addressLine2",
  "coordinates",
  "state",
  "createdAt"
) VALUES 
  ('550e8400-e29b-41d4-a716-446655440000', 'villa-rosa', 2, 'Italy', 'Tuscany', 'Florence', 'Florence', '50123', 'villa', 'Via dei Giardini 4', '', ST_Point(43.7696, 11.2558), 'online', NOW()),
  ('550e8400-e29b-41d4-a716-446655440001', 'the-green-gables', 3, 'Canada', 'Prince Edward Island', 'Queens County', 'Cavendish', 'C0A 1N0', 'house', 'Green Gables 4542', 'Lucy Maud Montgomery', ST_Point(46.4895, -63.3787), 'online', NOW()),
  ('550e8400-e29b-41d4-a716-446655440002', 'blue-ocean-reef', 4, 'Australia', 'Queensland', 'Cairns', 'Port Douglas', '4877', 'ocean', 'Reef Marina', '', ST_Point(-16.4836, 145.4653), 'online', NOW()),
  ('550e8400-e29b-41d4-a716-446655440003', 'golden-gate-bridge', 5, 'USA', 'California', 'San Francisco', 'San Francisco', 'CA 94129', 'monument', 'Golden Gate bridge', '', ST_Point(37.8199, -122.4783), 'online', NOW()),
  ('550e8400-e29b-41d4-a716-446655440004', 'mount-everest-base', 6, 'Nepal', '', '', 'Solukhumbu District', '', 'monument', 'Mount Everest Base Camp', '', ST_Point(27.9881, 86.9250), 'online', NOW());
