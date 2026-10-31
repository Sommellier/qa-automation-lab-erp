interface IpRequest {
  ip: string | undefined;
  socket: { remoteAddress?: string | undefined };
}

export function getClientIp(request: IpRequest): string {
  return request.ip || request.socket.remoteAddress || 'unknown';
}
