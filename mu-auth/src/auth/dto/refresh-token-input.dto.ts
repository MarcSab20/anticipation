import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsString } from 'class-validator';

@InputType()
export class RefreshTokenInputDto {
  @Field()
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}