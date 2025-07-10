import { Field, ObjectType, Int } from '@nestjs/graphql';

@ObjectType()
export class LoginResponseDto {
  @Field(() => String, { description: "Token d'accès JWT" })
  accessToken: string;

  @Field(() => String, { nullable: true, description: "Token de rafraîchissement" })
  refreshToken?: string;

  @Field(() => String, { description: "Type de token (Bearer)" })
  tokenType: string;

  @Field(() => Int, { nullable: true, description: "Durée de validité en secondes" })
  expiresIn?: number;

  @Field(() => String, { nullable: true, description: "Scope du token" })
  scope?: string;

  @Field(() => String, { nullable: true, description: "ID de session" })
  sessionId?: string;
}