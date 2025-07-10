
export interface AuthorizationRequest {
  
  userId: string;

  userAttributes?: Record<string, any>;

  resourceType: string;
  
  resourceId: string;
  
  resourceAttributes?: Record<string, any>;
  
  action: string;
  
  context?: Record<string, any>;
}
