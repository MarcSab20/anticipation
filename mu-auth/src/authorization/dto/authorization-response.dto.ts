import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class AuthorizationResponseDto {
  @Field(() => Boolean, { description: "Indique si l'accès est autorisé" })
  allow: boolean;

  @Field(() => String, { nullable: true, description: "Raison de la décision" })
  reason?: string;

  @Field(() => String, { nullable: true, description: "Timestamp de la décision" })
  timestamp?: string;

  @Field(() => Number, { nullable: true, description: "Temps d'évaluation en ms" })
  evaluationTime?: number;

  @Field(() => Boolean, { nullable: true, description: "Résultat mis en cache" })
  cached?: boolean;

  @Field(() => String, { nullable: true, description: "ID de corrélation" })
  correlationId?: string;
}