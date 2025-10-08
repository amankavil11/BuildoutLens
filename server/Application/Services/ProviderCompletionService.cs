using System;
using System.Threading.Tasks;
using BuildoutLensBackend.Domain;
using BuildoutLensBackend.Infrastructure;

namespace BuildoutLensBackend.Application.Services
{
    public class ProviderCompletionService
    {
        private readonly TemplateIndexer _templateIndexer;
        
        public ProviderCompletionService(TemplateIndexer templateIndexer)
        {
            _templateIndexer = templateIndexer;
        }
        
        public async Task<ProviderCompletionResponse> GetProviderCompletionAsync(ProviderCompletionRequest request)
        {
            try
            {
                // Try to initialize indexer but don't fail if it doesn't work
                try 
                {
                    await _templateIndexer.IndexAllTemplatesAsync();
                }
                catch
                {
                    // Continue even if indexing fails
                }
                
                // Run on background thread to avoid blocking
                return await Task.Run(() => _templateIndexer.HandleProviderCompletion(request));
            }
            catch (Exception ex)
            {
                return new ProviderCompletionResponse
                {
                    //Success = false,
                    ErrorMessage = $"Error processing provider completion: {ex.Message}",
                    ProviderName = request.ProviderName ?? "unknown"
                };
            }
        }
    }
}