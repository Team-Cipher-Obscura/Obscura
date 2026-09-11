import base64

with open("test_image.png", "rb") as f:
    b64 = base64.b64encode(f.read()).decode()

# write the FULL string to a text file, since it's too long to read in the terminal
with open("base64_output.txt", "w") as out:
    out.write(b64)

print("Done — full base64 string saved to base64_output.txt")
print("Length:", len(b64), "characters")