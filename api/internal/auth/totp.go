package auth

import (
	"bytes"
	"encoding/base64"
	"image/png"

	"github.com/pquerna/otp/totp"
)

func GenerateTOTPSecret(issuer, account string) (secret string, qrPNGBase64 string, err error) {
	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      issuer,
		AccountName: account,
	})
	if err != nil {
		return "", "", err
	}
	img, err := key.Image(200, 200)
	if err != nil {
		return "", "", err
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return "", "", err
	}
	return key.Secret(), base64.StdEncoding.EncodeToString(buf.Bytes()), nil
}

func ValidateTOTP(secret, code string) bool {
	return totp.Validate(code, secret)
}
