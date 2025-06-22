import { gql } from '@apollo/client';

export const LOGIN_MUTATION = gql`
  mutation Login($input: LoginInputDto!) {
    login(input: $input) {
      accessToken
      refreshToken
      tokenType
      expiresIn
      sessionId
    }
  }
`;

export const VALIDATE_TOKEN_QUERY = gql`
  query ValidateToken($token: String!) {
    validateToken(token: $token) {
      valid
      userId
      email
      givenName
      familyName
      roles
    }
  }
`;

export const GET_USER_INFO_QUERY = gql`
  query GetUserInfo($userId: String!) {
    getUserInfo(userId: $userId) {
      sub
      email
      given_name
      family_name
      preferred_username
      roles
      organization_ids
      state
      attributes {
        department
        clearanceLevel
        jobTitle
      }
    }
  }
`;

export const REFRESH_TOKEN_MUTATION = gql`
  mutation RefreshToken($input: RefreshTokenInputDto!) {
    refreshToken(input: $input) {
      accessToken
      refreshToken
      tokenType
      expiresIn
    }
  }
`;