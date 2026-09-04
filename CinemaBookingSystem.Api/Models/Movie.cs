namespace CinemaBookingSystem.Api.Models;

public class Movie
{
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Synopsis { get; set; } = string.Empty;
    public int DurationMinutes { get; set; }
    public string PosterUrl { get; set; } = string.Empty;
    public string Rating { get; set; } = "PG";
    public ICollection<Showtime> Showtimes { get; set; } = new List<Showtime>();
}
