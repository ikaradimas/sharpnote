using FluentAssertions;
using SharpNoteKernel;
using Xunit;

namespace kernel.Tests;

public class DockerHelperTests
{
    [Fact]
    public void ContainerInfo_record_stores_all_fields()
    {
        var info = new ContainerInfo("abc123", "my-redis", "redis:7", "Up 5 minutes", "0.0.0.0:6379->6379/tcp");

        info.Id.Should().Be("abc123");
        info.Name.Should().Be("my-redis");
        info.Image.Should().Be("redis:7");
        info.Status.Should().Be("Up 5 minutes");
        info.Ports.Should().Be("0.0.0.0:6379->6379/tcp");
    }

    [Fact]
    public void ContainerInfo_record_equality()
    {
        var a = new ContainerInfo("abc", "name", "img", "Up", "80/tcp");
        var b = new ContainerInfo("abc", "name", "img", "Up", "80/tcp");

        a.Should().Be(b);
    }

    [Fact]
    public void DockerHelper_constructor_accepts_text_writer()
    {
        var writer = new StringWriter();
        var helper = new DockerHelper(writer);

        helper.Should().NotBeNull();
    }

    [Fact]
    public void IsRunning_returns_false_when_docker_not_available()
    {
        // When docker is not installed or the container doesn't exist,
        // IsRunning catches the exception and returns false.
        var helper = new DockerHelper(new StringWriter());

        var result = helper.IsRunning("nonexistent-container-12345");

        result.Should().BeFalse();
    }
}
