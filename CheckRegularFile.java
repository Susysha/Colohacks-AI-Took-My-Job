import java.nio.file.*;
public class CheckRegularFile {
  public static void main(String[] args) {
    for (String arg : args) {
      Path p = Paths.get(arg);
      System.out.println(arg + " => exists=" + Files.exists(p) + ", regular=" + Files.isRegularFile(p) + ", symbolic=" + Files.isSymbolicLink(p));
    }
  }
}
