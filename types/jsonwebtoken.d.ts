declare module 'jsonwebtoken' {
  export interface SignOptions {
    expiresIn?: string | number
    [key: string]: any
  }
  export function sign(
    payload: string | Buffer | object,
    secretOrPrivateKey: string | Buffer,
    options?: SignOptions
  ): string
  export function verify(
    token: string,
    secretOrPublicKey: string | Buffer,
    options?: any
  ): any
  export function decode(token: string, options?: any): any
  const jwt: {
    sign: typeof sign
    verify: typeof verify
    decode: typeof decode
  }
  export default jwt
}
