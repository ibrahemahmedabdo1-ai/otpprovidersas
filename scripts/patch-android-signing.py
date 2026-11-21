"""Wires android/key.properties into the generated android/app Gradle file for release signing.
Usage: python3 patch-android-signing.py android/app   (handles build.gradle.kts and build.gradle)."""
import pathlib, re, sys

d = pathlib.Path(sys.argv[1])
kts = d / "build.gradle.kts"
if kts.exists():
    s = kts.read_text()
    if "keystoreProperties" in s:
        sys.exit(0)
    s = "import java.util.Properties\nimport java.io.FileInputStream\n\n" + s
    s = s.replace("android {", """val keystoreProperties = Properties().apply {
    val f = rootProject.file("key.properties")
    if (f.exists()) load(FileInputStream(f))
}

android {""", 1)
    s = s.replace("    buildTypes {", """    signingConfigs {
        create("release") {
            keyAlias = keystoreProperties["keyAlias"] as String
            keyPassword = keystoreProperties["keyPassword"] as String
            storeFile = file(keystoreProperties["storeFile"] as String)
            storePassword = keystoreProperties["storePassword"] as String
        }
    }

    buildTypes {""", 1)
    s2 = re.sub(r'signingConfig\s*=\s*signingConfigs\.getByName\("debug"\)', 'signingConfig = signingConfigs.getByName("release")', s)
    if s2 == s:
        sys.exit("could not find the release signingConfig line to replace")
    kts.write_text(s2)
    sys.exit(0)

groovy = d / "build.gradle"
s = groovy.read_text()
if "keystoreProperties" in s:
    sys.exit(0)
s = """def keystoreProperties = new Properties()
def keystorePropertiesFile = rootProject.file('key.properties')
if (keystorePropertiesFile.exists()) { keystoreProperties.load(new FileInputStream(keystorePropertiesFile)) }

""" + s
s = s.replace("    buildTypes {", """    signingConfigs {
        release {
            keyAlias keystoreProperties['keyAlias']
            keyPassword keystoreProperties['keyPassword']
            storeFile file(keystoreProperties['storeFile'])
            storePassword keystoreProperties['storePassword']
        }
    }

    buildTypes {""", 1)
s2 = s.replace("signingConfig signingConfigs.debug", "signingConfig signingConfigs.release")
if s2 == s:
    sys.exit("could not find the release signingConfig line to replace")
groovy.write_text(s2)
