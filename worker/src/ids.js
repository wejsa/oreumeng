const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const encodeTime = (time, length = 10) => {
  let value = BigInt(time);
  let result = "";
  for (let index = 0; index < length; index += 1) {
    result = alphabet[Number(value % 32n)] + result;
    value /= 32n;
  }
  return result;
};

const randomPart = (length = 16) => {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((value) => alphabet[value % 32]).join("");
};

export const ulid = () => `${encodeTime(Date.now())}${randomPart()}`;
export const imageId = () => `img_${ulid()}`;
export const validUlid = (value) => /^[0-9A-HJKMNP-TV-Z]{26}$/.test(value);
export const validImageId = (value) =>
  /^img_[0-9A-HJKMNP-TV-Z]{26}$/.test(value);

