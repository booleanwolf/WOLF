// Usage: npm run hash-password -- 'your password'
import { hashPassword } from '../server/auth.js';

const pw = process.argv[2];
if (!pw) {
  console.error("Usage: npm run hash-password -- 'your password'");
  process.exit(1);
}
console.log(hashPassword(pw));
