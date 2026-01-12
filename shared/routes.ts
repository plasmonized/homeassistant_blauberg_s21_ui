import { z } from 'zod';
import { insertDeviceSchema, insertRegisterSchema, modbusCommandSchema, devices, registers } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  devices: {
    list: {
      method: 'GET' as const,
      path: '/api/devices',
      responses: {
        200: z.array(z.custom<typeof devices.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/devices',
      input: insertDeviceSchema,
      responses: {
        201: z.custom<typeof devices.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/devices/:id',
      responses: {
        200: z.custom<typeof devices.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/devices/:id',
      input: insertDeviceSchema.partial(),
      responses: {
        200: z.custom<typeof devices.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/devices/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    connect: {
      method: 'POST' as const,
      path: '/api/devices/:id/connect',
      responses: {
        200: z.object({ success: z.boolean(), message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
    poll: {
      method: 'POST' as const,
      path: '/api/devices/:id/poll',
      responses: {
        200: z.object({ success: z.boolean(), message: z.string() }),
      }
    }
  },
  registers: {
    list: {
      method: 'GET' as const,
      path: '/api/devices/:id/registers',
      responses: {
        200: z.array(z.custom<typeof registers.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/devices/:id/registers',
      input: insertRegisterSchema.omit({ deviceId: true }),
      responses: {
        201: z.custom<typeof registers.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/registers/:id',
      input: insertRegisterSchema.partial(),
      responses: {
        200: z.custom<typeof registers.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/registers/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    write: {
      method: 'POST' as const,
      path: '/api/registers/:id/write',
      input: z.object({ value: z.union([z.number(), z.boolean(), z.string()]) }),
      responses: {
        200: z.object({ success: z.boolean(), value: z.any() }),
        400: errorSchemas.validation,
      }
    }
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
