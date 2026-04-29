/**
 * Helpers to extract HTTP method and path from either:
 * - API Gateway v2 (HTTP API) event: event.requestContext.http.method / event.rawPath
 * - API Gateway v1 (REST API) event: event.httpMethod / event.path
 *
 * This allows handlers to work with both API Gateway versions.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getMethod(event: any): string {
  return (
    event?.requestContext?.http?.method ??
    event?.httpMethod ??
    ''
  ).toUpperCase();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getPath(event: any): string {
  const raw: string =
    event?.requestContext?.http?.path ??
    event?.rawPath ??
    event?.path ??
    '';
  // Strip /api prefix added by CloudFront routing so handlers
  // can match paths like /admin/samples regardless of the prefix.
  return raw.replace(/^\/api/, '');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getPathParameters(event: any): Record<string, string> {
  return event?.pathParameters ?? {};
}
