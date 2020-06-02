import { ServerRoute } from "@hapi/hapi";
import Joi from "@hapi/joi";
import { UserSchema } from "../joi";
import { GetProfileResponse } from "@template/common";
import { MOCK_GET_PROFILE_RESPONSE } from "../mocks/getProfile";

export const profileRoutes: ServerRoute[] = [
  {
    method: "GET",
    path: "/v1/profile",
    handler: async (request, h): Promise<GetProfileResponse> => {
      return MOCK_GET_PROFILE_RESPONSE;
    },
    options: {
      response: {
        schema: UserSchema.options({ presence: "required" }),
      },
    },
  },
];
